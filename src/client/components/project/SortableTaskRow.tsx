import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Wraps a Tasks-tab table row so it can be dragged within its due-date tie
 * group (see the /reorder endpoint in tasks.ts). Kept as its own module-level
 * component — defining it inline inside ProjectDetailPage's render would give
 * React a new component identity every render and remount every row,
 * dropping focus out of whatever cell a PM is mid-edit in.
 */
export default function SortableTaskRow({
  id,
  dragEnabled,
  children,
}: {
  id: string;
  /** Only tasks that tie with a neighbor on due_date within the same stage
   *  are actually draggable — everything else renders inert. */
  dragEnabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !dragEnabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.6 : undefined,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 3 : undefined,
    background: isDragging ? "#eff6ff" : undefined,
  };

  return (
    <tr ref={setNodeRef} style={style} data-task-row={id}>
      <td style={{ padding: "5px 2px", textAlign: "center", verticalAlign: "middle", width: 22 }}>
        {dragEnabled && (
          <span
            {...attributes}
            {...listeners}
            title="Drag to reorder among tasks with the same due date"
            style={{ cursor: "grab", color: "#94a3b8", fontSize: 13, userSelect: "none", touchAction: "none", display: "inline-block" }}
          >
            ⠿
          </span>
        )}
      </td>
      {children}
    </tr>
  );
}
