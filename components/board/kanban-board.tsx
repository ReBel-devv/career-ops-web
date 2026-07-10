"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
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
 * Drop animation: a smooth, slightly emphasized decelerate curve so the card
 * settles rather than snaps. The overlay tilt/scale is reset over the same
 * window for a natural "set down" feel.
 */
const dropAnimation: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
};

/**
 * Desktop Kanban board (F1): horizontal columns, drag between them, keyboard
 * drag (dnd-kit KeyboardSensor + announcements), and a "Move to status" menu on
 * every card as the accessible mirror. A drag over a different column triggers
 * `onMove` → optimistic PATCH (handled by the caller's mutation).
 *
 * Mobile (< md) does NOT use this — MobileBoard replaces horizontal drag with a
 * segmented status control + action sheet (plan §2). This board is rendered
 * inside a `hidden md:flex` wrapper by the parent.
 */
export function KanbanBoard({
  columns,
  states,
  onMove,
  disabled = false,
  overdueNums,
  outreachByNum,
}: {
  columns: BoardColumn[];
  states: CanonicalState[];
  onMove: (app: Application, statusId: string) => void;
  disabled?: boolean;
  overdueNums?: Set<number>;
  outreachByNum?: Map<number, OutreachCardHint>;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [activeApp, setActiveApp] = useState<Application | null>(null);

  // Columns are the droppables (no intra-column sorting). `closestCorners`
  // alone is unreliable once a column is tall enough to overflow: its far
  // (bottom) corners inflate the corner distance, so an adjacent SHORTER column
  // wins the collision and dropping onto the long column fails. `pointerWithin`
  // answers the real question ("which column is the pointer over?") accurately
  // regardless of column height; we fall back to `closestCorners` only when
  // there is no pointer (keyboard drag). This is the dnd-kit multi-container
  // recommendation. See docs/DASHBOARD-FIXES.md #1.
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
  };

  const sensors = useSensors(
    // distance guard so clicking a card link doesn't start a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byNum = useMemo(() => {
    const m = new Map<number, Application>();
    for (const c of columns) for (const a of c.applications) m.set(a.num, a);
    return m;
  }, [columns]);

  const labelOf = (statusId: string) =>
    states.find((s) => s.id === statusId)?.label ?? statusId;

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const app = byNum.get(Number(active.id));
      return app
        ? `Picked up ${app.company} card, currently in ${labelOf(app.statusId ?? "")}.`
        : "Picked up card.";
    },
    onDragOver: ({ over }) =>
      over ? `Over ${labelOf(String(over.id))} column.` : "Not over a column.",
    onDragEnd: ({ active, over }) => {
      const app = byNum.get(Number(active.id));
      if (over && app) return `Moved ${app.company} to ${labelOf(String(over.id))}.`;
      return "Move cancelled.";
    },
    onDragCancel: () => "Move cancelled.",
  };

  function handleDragStart(event: DragStartEvent) {
    setActiveApp(byNum.get(Number(event.active.id)) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveApp(null);
    const { active, over } = event;
    if (!over) return;
    const app = byNum.get(Number(active.id));
    const targetStatusId = String(over.id);
    if (app && app.statusId !== targetStatusId) onMove(app, targetStatusId);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveApp(null)}
    >
      <div className="flex h-full gap-3 overflow-x-auto pb-2">
        {columns.map((column) => (
          <Column
            key={column.state.id}
            column={column}
            states={states}
            onMove={onMove}
            disabled={disabled}
            overdueNums={overdueNums}
            outreachByNum={outreachByNum}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={reducedMotion ? null : dropAnimation}>
        {activeApp ? (
          <ApplicationCard
            app={activeApp}
            className={cn(
              "w-64 cursor-grabbing shadow-2xl ring-1 ring-foreground/10",
              // Picked-up feel: a slight tilt + lift. Skipped under reduced motion.
              !reducedMotion && "rotate-[2deg] scale-[1.03]",
            )}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  column,
  states,
  onMove,
  disabled,
  overdueNums,
  outreachByNum,
}: {
  column: BoardColumn;
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
      aria-label={`${column.state.label} column, ${column.applications.length} applications`}
      className="flex w-64 shrink-0 flex-col"
    >
      <header className="mb-2 flex items-center gap-1.5 px-1">
        <span aria-hidden className={cn("size-2 rounded-full", dot)} />
        <h2 className="text-data font-medium">{column.state.label}</h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {column.applications.length}
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
        {column.applications.map((app) => (
          <DraggableCard
            key={app.num}
            app={app}
            states={states}
            onMove={onMove}
            disabled={disabled}
            overdue={overdueNums?.has(app.num) ?? false}
            outreach={outreachByNum?.get(app.num)}
          />
        ))}
        {column.applications.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground/60">
            Drop here
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DraggableCard({
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
    isDragging,
  } = useDraggable({ id: app.num, disabled });

  // A11y split (axe `nested-interactive`): the card div keeps the POINTER
  // listeners (drag from anywhere with the mouse) but carries no interactive
  // role — its link and buttons stay properly reachable. The keyboard/ARIA
  // drag surface is a dedicated handle button (dnd-kit activator) carrying
  // `attributes` (role, tabindex, aria-roledescription) + listeners.
  //
  // With a DragOverlay, the source stays put as a dimmed ghost (no transform)
  // and the overlay carries the motion — cleaner than translating both.
  return (
    <ApplicationCard
      ref={setNodeRef}
      app={app}
      overdue={overdue}
      outreach={outreach}
      dragging={isDragging}
      className={cn(
        !disabled && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40 ring-1 ring-border",
      )}
      action={
        <>
          {!disabled ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              aria-label={`Drag #${app.num} ${app.company}`}
              className="inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
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
