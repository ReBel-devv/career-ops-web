"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ApplicationCard } from "@/components/board/application-card";
import { MoveStatusMenu } from "@/components/board/move-status-menu";
import { STATUS_DOT_CLASS } from "@/components/data/status-indicator";
import { usePrefersReducedMotion } from "@/lib/client/use-reduced-motion";
import type { Application, CanonicalState } from "@/lib/domain";
import type { BoardColumn } from "@/lib/grouping";
import { cn } from "@/lib/utils";

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
}: {
  columns: BoardColumn[];
  states: CanonicalState[];
  onMove: (app: Application, statusId: string) => void;
  disabled?: boolean;
  overdueNums?: Set<number>;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [activeApp, setActiveApp] = useState<Application | null>(null);

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
      collisionDetection={closestCorners}
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
          />
        ))}
      </div>

      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {activeApp ? (
          <ApplicationCard app={activeApp} dragging className="w-64 cursor-grabbing shadow-lg" />
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
}: {
  column: BoardColumn;
  states: CanonicalState[];
  onMove: (app: Application, statusId: string) => void;
  disabled: boolean;
  overdueNums?: Set<number>;
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
          "flex flex-1 flex-col gap-2 rounded-lg border border-dashed border-transparent p-1 transition-colors",
          isOver && "border-ring bg-accent/40",
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
}: {
  app: Application;
  states: CanonicalState[];
  onMove: (app: Application, statusId: string) => void;
  disabled: boolean;
  overdue: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: app.num,
    disabled,
  });

  return (
    <ApplicationCard
      ref={setNodeRef}
      app={app}
      overdue={overdue}
      dragging={isDragging}
      className={cn(!disabled && "cursor-grab active:cursor-grabbing")}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      action={
        <MoveStatusMenu
          app={app}
          states={states}
          onMove={(statusId) => onMove(app, statusId)}
          disabled={disabled}
        />
      }
      {...attributes}
      {...listeners}
    />
  );
}
