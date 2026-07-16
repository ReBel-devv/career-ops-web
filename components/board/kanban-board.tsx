"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  defaultDropAnimationSideEffects,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { ApplicationCard } from "@/components/board/application-card";
import { MoveStatusMenu } from "@/components/board/move-status-menu";
import { STATUS_DOT_CLASS } from "@/components/data/status-indicator";
import { usePrefersReducedMotion } from "@/lib/client/use-reduced-motion";
import type { OutreachCardHint } from "@/lib/outreach-view";
import type { Application, CanonicalState } from "@/lib/domain";
import type { BoardColumn } from "@/lib/grouping";
import { cn } from "@/lib/utils";

/**
 * Reflow physics for the cards that shift to make room. An ease-out quart curve
 * (fast start, long soft settle) reads as weight + inertia without any bounce —
 * sober and premium, not springy. Shared by the sortable transition and, via
 * the same curve, the drop dissolve.
 */
const SORT_TRANSITION = { duration: 260, easing: "cubic-bezier(0.25, 1, 0.5, 1)" };

/**
 * Drop animation = the overlay **travels** from the cursor to the ghost slot.
 *
 * The dragged card's real DOM node lives, throughout the drag, at the exact
 * slot the auto-sort will drop it into (see `placeActive` — the gap is opened
 * by rank, not by pointer). So dnd-kit's default keyframes (overlay glides from
 * its release transform to that node's rect) read as *the same element
 * continuing its motion* to its final home — no teleport, no return-to-source.
 * `sideEffects` keeps the underlying node hidden until the glide lands, so the
 * card is never visible twice and there is no flash on hand-off.
 */
const dropAnimation: DropAnimation = {
  duration: 300,
  easing: "cubic-bezier(0.2, 0.85, 0.25, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0" } },
  }),
};

// Keep laid-out cards animating into place after a cross-column move, too.
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

type Items = Record<string, number[]>;

/** Column id → ordered app nums, straight from the grouped columns. */
function deriveItems(columns: BoardColumn[]): Items {
  const items: Items = {};
  for (const c of columns) items[c.state.id] = c.applications.map((a) => a.num);
  return items;
}

/** A stable signature of the grouped columns (membership + placement + order). */
function columnsSignature(columns: BoardColumn[]): string {
  return columns.map((c) => `${c.state.id}:${c.applications.map((a) => a.num).join(",")}`).join("|");
}

/** A stable signature of a local Items map (for cheap "did placement change?"). */
function itemsSignature(items: Items): string {
  return Object.keys(items)
    .sort()
    .map((k) => `${k}:${items[k].join(",")}`)
    .join("|");
}

/** Insertion index for `activeNum` among `residents`, by ascending auto-sort rank. */
function insertIndexByRank(
  residents: number[],
  activeNum: number,
  rankByNum: Map<number, number>,
): number {
  const activeRank = rankByNum.get(activeNum) ?? Number.POSITIVE_INFINITY;
  let i = 0;
  while (i < residents.length && (rankByNum.get(residents[i]) ?? Infinity) < activeRank) i++;
  return i;
}

/**
 * Deterministically place the dragged card into `targetContainer` at the slot
 * the auto-sort would land it — computed from the pre-drag canonical snapshot,
 * NOT the pointer position. This is the whole idea: the gap opens where the card
 * will actually end up, so the ghost preview never lies about the destination.
 */
function placeActive(
  base: Items,
  activeNum: number,
  targetContainer: string,
  rankByNum: Map<number, number>,
): Items {
  const result: Items = {};
  for (const [cid, nums] of Object.entries(base)) {
    result[cid] = nums.filter((n) => n !== activeNum);
  }
  const residents = result[targetContainer] ?? [];
  const idx = insertIndexByRank(residents, activeNum, rankByNum);
  result[targetContainer] = [...residents.slice(0, idx), activeNum, ...residents.slice(idx)];
  return result;
}

/**
 * Desktop Kanban board (F1). Columns are sortable containers, but intra-column
 * order is **automatic** (by `rankByNum`), not hand-sorted. So dragging a card
 * over another column opens the make-room gap at the card's *computed* landing
 * slot (see `placeActive`) rather than under the pointer — the ghost preview
 * always shows the true destination, and on drop the overlay simply glides into
 * that already-open slot. Status is persisted on drop via `onMove`. Keyboard
 * drag (KeyboardSensor + announcements) and a per-card "Move to status" menu are
 * the accessible mirrors.
 *
 * Mobile (< md) uses MobileBoard instead (rendered by the parent).
 */
export function KanbanBoard({
  columns,
  states,
  rankByNum,
  onMove,
  disabled = false,
  overdueNums,
  outreachByNum,
}: {
  columns: BoardColumn[];
  states: CanonicalState[];
  /** Auto-sort key: app num → its rank in the global order (from board.tsx). */
  rankByNum: Map<number, number>;
  onMove: (app: Application, statusId: string) => void;
  disabled?: boolean;
  overdueNums?: Set<number>;
  outreachByNum?: Map<number, OutreachCardHint>;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [activeApp, setActiveApp] = useState<Application | null>(null);
  const [items, setItems] = useState<Items>(() => deriveItems(columns));

  // Pre-drag snapshot: the canonical membership. It is both the cancel target
  // and the base every `placeActive` recomputes from.
  const clonedItems = useRef<Items | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);

  // Mirror external column changes into local state while idle (adjust-state-
  // during-render pattern). While dragging, the local `items` is authoritative
  // so make-room edits are never clobbered by a stale props signature.
  const [adoptedSig, setAdoptedSig] = useState<string>(() => columnsSignature(columns));
  if (activeApp === null) {
    const sig = columnsSignature(columns);
    if (sig !== adoptedSig) {
      setAdoptedSig(sig);
      setItems(deriveItems(columns));
    }
  }

  const byNum = useMemo(() => {
    const m = new Map<number, Application>();
    for (const c of columns) for (const a of c.applications) m.set(a.num, a);
    return m;
  }, [columns]);

  const containers = useMemo(() => columns.map((c) => c.state.id), [columns]);

  const findContainer = useCallback(
    (id: UniqueIdentifier | number): string | undefined => {
      if (typeof id === "string" && id in items) return id;
      const num = Number(id);
      return containers.find((c) => items[c]?.includes(num));
    },
    [items, containers],
  );

  /**
   * Collision resolves to the COLUMN under the pointer (never a card): the
   * within-column slot is decided by rank, not by which card we hover, so the
   * only thing collision must answer is "which column?". Pointer-first keeps it
   * accurate no matter the column height (the long-column fix, #1); rect
   * fallback covers the keyboard sensor. `lastOverId` holds a valid column
   * across the frame where the card crosses a boundary.
   */
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerCollisions = pointerWithin(args);
      const intersections =
        pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        // Map a card hit up to its column; a column hit passes through.
        if (typeof overId !== "string" || !(overId in items)) {
          const container = findContainer(overId);
          if (container) overId = container;
        }
        lastOverId.current = overId;
        return [{ id: overId }];
      }

      return lastOverId.current != null ? [{ id: lastOverId.current }] : [];
    },
    [items, findContainer],
  );

  const sensors = useSensors(
    // distance guard so clicking a card link doesn't start a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const labelOf = (statusId: string) =>
    states.find((s) => s.id === statusId)?.label ?? statusId;

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const app = byNum.get(Number(active.id));
      return app
        ? `Picked up ${app.company} card, currently in ${labelOf(app.statusId ?? "")}.`
        : "Picked up card.";
    },
    onDragOver: ({ over }) => {
      const container = over ? findContainer(over.id) : undefined;
      return container ? `Over ${labelOf(container)} column.` : "Not over a column.";
    },
    onDragEnd: ({ active, over }) => {
      const app = byNum.get(Number(active.id));
      const container = over ? findContainer(over.id) : undefined;
      if (app && container) return `Moved ${app.company} to ${labelOf(container)}.`;
      return "Move cancelled.";
    },
    onDragCancel: () => "Move cancelled.",
  };

  function handleDragStart(event: DragStartEvent) {
    clonedItems.current = items;
    setActiveApp(byNum.get(Number(event.active.id)) ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const overContainer = findContainer(over.id); // collision → column id
    const base = clonedItems.current;
    if (!overContainer || !base) return;

    const activeNum = Number(active.id);
    // Re-derive the whole placement from the canonical pre-drag snapshot every
    // time: the card sits in `overContainer` at its rank slot. Because the slot
    // depends only on the column (not the pointer Y), the gap is rock-steady —
    // no thrashing as the pointer moves within a column. Skip the state write
    // when nothing actually changed.
    const next = placeActive(base, activeNum, overContainer, rankByNum);
    setItems((prev) => (itemsSignature(prev) === itemsSignature(next) ? prev : next));
  }

  function handleDragEnd(event: DragEndEvent) {
    const app = activeApp;
    const cloned = clonedItems.current;
    clonedItems.current = null;
    setActiveApp(null);

    const { active, over } = event;
    if (!app || !over) {
      if (cloned) setItems(cloned);
      return;
    }
    // After onDragOver the card already sits in its destination container.
    const finalContainer = findContainer(active.id) ?? findContainer(over.id);
    if (!finalContainer) {
      if (cloned) setItems(cloned);
      return;
    }
    if (app.statusId !== finalContainer) {
      // Persist the status. Local `items` already reflects it; the optimistic
      // update will re-derive the same placement, so no revert flicker.
      onMove(app, finalContainer);
    } else {
      // Same column, no status change — snap back to the canonical order (we
      // don't persist intra-column order).
      setItems(deriveItems(columns));
    }
  }

  function handleDragCancel() {
    if (clonedItems.current) setItems(clonedItems.current);
    clonedItems.current = null;
    setActiveApp(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* scrollbar-subtle: same thin, rounded scrollbar as the columns' vertical ones. */}
      <div className="scrollbar-subtle flex h-full gap-3 overflow-x-auto pb-2">
        {columns.map((column) => {
          const ids = items[column.state.id] ?? [];
          const apps = ids
            .map((n) => byNum.get(n))
            .filter((a): a is Application => a != null);
          return (
            <Column
              key={column.state.id}
              column={column}
              apps={apps}
              states={states}
              onMove={onMove}
              disabled={disabled}
              overdueNums={overdueNums}
              outreachByNum={outreachByNum}
            />
          );
        })}
      </div>

      <DragOverlay dropAnimation={reducedMotion ? null : dropAnimation}>
        {activeApp ? (
          <ApplicationCard
            app={activeApp}
            // Elevation ONLY — shadow + ring, no rotate/scale. The overlay must
            // share the resting card's exact geometry so the drop travel lands
            // on it with zero discontinuity. Any transform here (tilt/scale)
            // stays constant through the glide and then snaps away at hand-off —
            // that snap is the flick we're avoiding. Lift is carried by the
            // shadow, which reads as "picked up" without changing geometry.
            className="w-64 cursor-grabbing shadow-2xl ring-1 ring-foreground/10"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  column,
  apps,
  states,
  onMove,
  disabled,
  overdueNums,
  outreachByNum,
}: {
  column: BoardColumn;
  apps: Application[];
  states: CanonicalState[];
  onMove: (app: Application, statusId: string) => void;
  disabled: boolean;
  overdueNums?: Set<number>;
  outreachByNum?: Map<number, OutreachCardHint>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.state.id });
  const dot = STATUS_DOT_CLASS[column.state.dashboardGroup] ?? "bg-muted-foreground/40";

  return (
    <section
      aria-label={`${column.state.label} column, ${apps.length} applications`}
      className="flex w-64 shrink-0 flex-col"
    >
      <header className="mb-2 flex items-center gap-1.5 px-1">
        <span aria-hidden className={cn("size-2 rounded-full", dot)} />
        <h2 className="text-data font-medium">{column.state.label}</h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {apps.length}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          // `min-h-0 overflow-y-auto` keeps a long column scrolling INSIDE its
          // own body instead of overflowing the board — so the droppable rect
          // stays equal to the visible area (reliable collisions) and dnd-kit
          // can auto-scroll within the column. See docs/DASHBOARD-FIXES.md #1.
          "scrollbar-subtle flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-dashed border-transparent p-1 transition-colors duration-200",
          isOver && "border-primary/40 bg-accent/40",
        )}
      >
        <SortableContext
          items={apps.map((a) => a.num)}
          strategy={verticalListSortingStrategy}
        >
          {apps.map((app) => (
            <SortableCard
              key={app.num}
              app={app}
              states={states}
              onMove={onMove}
              disabled={disabled}
              overdue={overdueNums?.has(app.num) ?? false}
              outreach={outreachByNum?.get(app.num)}
            />
          ))}
        </SortableContext>
        {apps.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground/60">
            Drop here
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SortableCard({
  app,
  states,
  onMove,
  disabled,
  overdue,
  outreach,
}: {
  app: Application;
  states: CanonicalState[];
  onMove: (app: Application, statusId: string) => void;
  disabled: boolean;
  overdue: boolean;
  outreach?: OutreachCardHint;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: app.num, disabled, animateLayoutChanges, transition: SORT_TRANSITION });

  // A11y split (axe `nested-interactive`): the card div keeps the POINTER
  // listeners (drag from anywhere with the mouse) but carries no interactive
  // role — its link and buttons stay reachable. The keyboard/ARIA drag surface
  // is a dedicated handle button (dnd-kit activator) carrying `attributes` +
  // listeners. `transform`/`transition` are what make neighbours slide to open
  // a gap; the actively dragged card becomes the **future-position preview** — a
  // dashed, faintly tinted placeholder sitting in the exact slot the card will
  // land in — while the DragOverlay carries the motion under the cursor.
  return (
    <ApplicationCard
      ref={setNodeRef}
      app={app}
      overdue={overdue}
      outreach={outreach}
      dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        !disabled && "cursor-grab active:cursor-grabbing",
        isDragging &&
          "border-dashed border-primary/40 bg-primary/[0.04] opacity-80 shadow-none",
      )}
      action={
        <>
          {!disabled ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              aria-label={`Drag #${app.num} ${app.company}`}
              // touch-none: a touch-drag from the grip must not scroll the
              // column — the PointerSensor owns the gesture from here.
              className="inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" aria-hidden />
            </button>
          ) : null}
          <MoveStatusMenu
            app={app}
            states={states}
            onMove={(statusId) => onMove(app, statusId)}
            disabled={disabled}
          />
        </>
      }
      {...listeners}
    />
  );
}
