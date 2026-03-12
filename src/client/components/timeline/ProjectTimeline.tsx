import type { Milestone, Phase } from "../../lib/api";

type Props = {
  phases: Phase[];
  milestones: Milestone[];
};

export default function ProjectTimeline({ phases, milestones }: Props) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {phases.map((phase) => {
        const phaseMilestones = milestones.filter((m) => m.phase_id === phase.id);

        return (
          <div
            key={phase.id}
            style={{
              background: "#182247",
              borderRadius: 12,
              padding: 16,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f5f7fb" }}>
                  {phase.name}
                </div>
                <div style={{ fontSize: 13, color: "#b8c5e8", marginTop: 4 }}>
                  Planned: {phase.planned_start ?? "—"} → {phase.planned_end ?? "—"}
                </div>
              </div>

              <StatusBadge value={phase.status} />
            </div>

            <div
              style={{
                height: 10,
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: progressForStatus(phase.status),
                  height: "100%",
                  background: progressColor(phase.status),
                }}
              />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, color: "#c8d4ff", fontWeight: 600 }}>
                Milestones
              </div>

              {phaseMilestones.length === 0 ? (
                <div style={{ color: "#9fb0d9", fontSize: 14 }}>No milestones</div>
              ) : (
                phaseMilestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div>
                      <div style={{ color: "#eef3ff", fontWeight: 600 }}>
                        {milestone.name}
                      </div>
                      <div style={{ color: "#9fb0d9", fontSize: 13 }}>
                        Target: {milestone.target_date ?? "—"}
                      </div>
                    </div>

                    <StatusBadge value={milestone.status} />
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ value }: { value: string | null }) {
  const background = badgeColor(value);

  return (
    <span
      style={{
        background,
        color: "#fff",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        textTransform: "capitalize",
      }}
    >
      {value?.replaceAll("_", " ") ?? "unknown"}
    </span>
  );
}

function badgeColor(status: string | null) {
  switch (status) {
    case "complete":
      return "#1f9d55";
    case "in_progress":
      return "#2563eb";
    case "at_risk":
      return "#d97706";
    case "delayed":
      return "#dc2626";
    case "not_started":
      return "#64748b";
    case "open":
      return "#dc2626";
    default:
      return "#475569";
  }
}

function progressForStatus(status: string | null) {
  switch (status) {
    case "complete":
      return "100%";
    case "in_progress":
      return "60%";
    case "at_risk":
      return "60%";
    case "delayed":
      return "45%";
    case "not_started":
      return "10%";
    default:
      return "0%";
  }
}

function progressColor(status: string | null) {
  switch (status) {
    case "complete":
      return "#22c55e";
    case "in_progress":
      return "#3b82f6";
    case "at_risk":
      return "#f59e0b";
    case "delayed":
      return "#ef4444";
    case "not_started":
      return "#94a3b8";
    default:
      return "#475569";
  }
}