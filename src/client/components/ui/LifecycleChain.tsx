import { Link } from "react-router-dom";

const C = {
  solution:     { color: "#8764b8", bg: "rgba(135,100,184,0.10)", border: "rgba(135,100,184,0.28)" },
  project:      { color: "#63c1ea", bg: "rgba(99,193,234,0.10)",  border: "rgba(99,193,234,0.28)"  },
  optimization: { color: "#0b9aad", bg: "rgba(11,154,173,0.10)",  border: "rgba(11,154,173,0.28)"  },
} as const;

type Mod = keyof typeof C;
const LABEL: Record<Mod, string> = { solution: "Solution", project: "Project", optimization: "Optimization" };

function Node({ mod, name, href, isHere }: { mod: Mod; name: string; href?: string; isHere?: boolean }) {
  const c = C[mod];

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 0,
    padding: "5px 13px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.4,
    textDecoration: "none",
    whiteSpace: "nowrap",
    transition: "opacity 0.15s",
  };

  const tag = (
    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", opacity: 0.65, marginRight: 6 }}>
      {LABEL[mod]}
    </span>
  );

  // Current page — filled, no link
  if (isHere) {
    return (
      <span style={{ ...base, background: c.bg, border: `2px solid ${c.border}`, color: c.color, cursor: "default" }}>
        {tag}
        <span style={{ borderLeft: `1px solid ${c.border}`, paddingLeft: 8 }}>{name}</span>
        <span style={{ marginLeft: 6, fontSize: 8 }}>●</span>
      </span>
    );
  }

  // Unlinked placeholder — dashed, muted
  if (!href) {
    return (
      <span style={{ ...base, background: "transparent", border: "1px dashed rgba(148,163,184,0.35)", color: "#64748b", fontStyle: "italic", cursor: "default" }}>
        {tag}
      </span>
    );
  }

  // Linked — outlined, clickable
  return (
    <Link to={href} style={{ ...base, background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      {tag}
      <span style={{ borderLeft: `1px solid ${c.border}`, paddingLeft: 8 }}>{name}</span>
    </Link>
  );
}

function Arrow() {
  return (
    <span style={{ color: "#475569", fontSize: 16, flexShrink: 0, userSelect: "none", paddingBottom: 1 }}>→</span>
  );
}

export type ChainProject = { id: string; name: string; has_optimization?: number | boolean | null };

export type LifecycleChainProps = {
  current: Mod;
  currentLabel?: string;
  solution?: { id: string; name: string } | null;
  projects?: ChainProject[] | null;
  optimization?: { project_id: string } | null;
  actions?: React.ReactNode;
};

export default function LifecycleChain({
  current, currentLabel, solution, projects, optimization, actions,
}: LifecycleChainProps) {
  return (
    <div className="ms-card" style={{ padding: "14px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "#64748b", marginBottom: 12 }}>
        Lifecycle Chain
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>

        {/* ── Solution ── */}
        {current === "solution" ? (
          <Node mod="solution" name={currentLabel ?? "Solution"} isHere />
        ) : solution ? (
          <Node mod="solution" name={solution.name} href={`/solutions/${solution.id}`} />
        ) : (
          <Node mod="solution" name="—" />
        )}

        <Arrow />

        {/* ── Project(s) ── */}
        {current === "project" ? (
          <Node mod="project" name={currentLabel ?? "Project"} isHere />
        ) : projects && projects.length > 0 ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {projects.map((p) => (
              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Node mod="project" name={p.name} href={`/projects/${p.id}`} />
                {p.has_optimization ? (
                  <span style={{ fontSize: 10, color: C.optimization.color, fontWeight: 600 }}>→ Opt</span>
                ) : null}
              </span>
            ))}
          </div>
        ) : (
          <Node mod="project" name="—" />
        )}

        {/* ── Optimization — hidden on solution view since it branches per-project ── */}
        {current !== "solution" && (
          <>
            <Arrow />
            {current === "optimization" ? (
              <Node mod="optimization" name="Optimization" isHere />
            ) : optimization ? (
              <Node mod="optimization" name="Optimization" href={`/optimize/${optimization.project_id}`} />
            ) : (
              <Node mod="optimization" name="—" />
            )}
          </>
        )}

      </div>

      {actions && <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}
