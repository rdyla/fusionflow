import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

type Solution = {
  id: string; name: string; customer_name: string | null; vendor: string | null;
  status: string | null; created_at: string;
  needs_assessment_count: number; labor_estimate_count: number; contact_count: number;
  already_on_prod: boolean;
};
type Project = {
  id: string; name: string; customer_name: string | null; vendor: string | null;
  status: string | null; created_at: string;
  stage_count: number; task_count: number; risk_count: number; document_count: number;
  already_on_prod: boolean;
};
type OptimizeAccount = {
  id: string; project_id: string; project_name: string; customer_name: string | null;
  graduated_at: string;
  impact_assessment_count: number; tech_stack_count: number; roadmap_count: number; utilization_count: number;
  already_on_prod: boolean;
};

type Tab = "solutions" | "projects" | "optimize";

export default function AdminStagingPromotePage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [optimizeAccounts, setOptimizeAccounts] = useState<OptimizeAccount[]>([]);
  const [tab, setTab] = useState<Tab>("solutions");
  const [query, setQuery] = useState("");
  const [selSols, setSelSols] = useState<Set<string>>(new Set());
  const [selProjs, setSelProjs] = useState<Set<string>>(new Set());
  const [selOpts, setSelOpts] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState(false);
  const [result, setResult] = useState<Record<string, number | Array<{ kind: string; id: string; reason: string }>> | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const inv = await api.adminStagingInventory();
      setSolutions(inv.solutions);
      setProjects(inv.projects);
      setOptimizeAccounts(inv.optimize_accounts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load staging inventory";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const filteredSols = useMemo(() => filterRows(solutions, query, (s) => [s.name, s.customer_name, s.vendor]), [solutions, query]);
  const filteredProjs = useMemo(() => filterRows(projects, query, (p) => [p.name, p.customer_name, p.vendor]), [projects, query]);
  const filteredOpts = useMemo(() => filterRows(optimizeAccounts, query, (o) => [o.project_name, o.customer_name]), [optimizeAccounts, query]);

  const totalSelected = selSols.size + selProjs.size + selOpts.size;

  async function promote() {
    if (totalSelected === 0) {
      showToast("Select at least one item to promote.", "error");
      return;
    }
    const note = totalSelected === 1 ? "1 item" : `${totalSelected} items`;
    if (!window.confirm(`Promote ${note} from staging → production?\n\nThis copies records (and KV creds + R2 docs for projects) into prod. Existing prod rows are NOT overwritten.`)) return;
    try {
      setPromoting(true);
      setResult(null);
      const res = await api.adminStagingPromote({
        solution_ids: [...selSols],
        project_ids: [...selProjs],
        optimize_account_ids: [...selOpts],
      });
      setResult(res);
      showToast("Promotion complete.", "success");
      // Refresh inventory so already_on_prod flags update.
      setSelSols(new Set()); setSelProjs(new Set()); setSelOpts(new Set());
      void load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Promotion failed", "error");
    } finally {
      setPromoting(false);
    }
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading staging inventory...</div>;

  if (error) {
    return (
      <div style={{ maxWidth: 700, margin: "40px auto", padding: 24, border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 8, color: "#991b1b" }}>
        <h2 style={{ marginTop: 0, fontSize: 16, fontWeight: 700 }}>Staging promote unavailable</h2>
        <p style={{ marginBottom: 0, fontSize: 13 }}>{error}</p>
        <p style={{ marginTop: 8, fontSize: 12, color: "#7f1d1d" }}>
          This tool only runs on the production worker (cross-environment bindings to staging
          D1/KV/R2 are configured at the prod side of <code>wrangler.json</code>).
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Promote from staging</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {totalSelected} selected
          </span>
          <button
            className="ms-btn-primary"
            onClick={promote}
            disabled={promoting || totalSelected === 0}
          >
            {promoting ? "Promoting…" : `Promote ${totalSelected || ""}`}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "#475569", marginBottom: 16, padding: "10px 12px", background: "#f1f5f9", borderRadius: 6 }}>
        Pick the staging items to move into production. Conflicts (same ID already on prod) are
        skipped — prod rows are never overwritten. For projects, Zoom/RingCentral credentials in
        KV and uploaded documents in R2 are copied alongside the database rows.
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: 12 }}>
        <TabBtn label={`Solutions (${solutions.length})`} active={tab === "solutions"} onClick={() => setTab("solutions")} />
        <TabBtn label={`Projects (${projects.length})`} active={tab === "projects"} onClick={() => setTab("projects")} />
        <TabBtn label={`Optimize (${optimizeAccounts.length})`} active={tab === "optimize"} onClick={() => setTab("optimize")} />
      </div>

      <input
        type="text"
        placeholder="Filter by name, customer, or vendor…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 6, marginBottom: 12 }}
      />

      {tab === "solutions" && (
        <SolutionsTable rows={filteredSols} selected={selSols} setSelected={setSelSols} />
      )}
      {tab === "projects" && (
        <ProjectsTable rows={filteredProjs} selected={selProjs} setSelected={setSelProjs} />
      )}
      {tab === "optimize" && (
        <OptimizeTable rows={filteredOpts} selected={selOpts} setSelected={setSelOpts} />
      )}

      {result && (
        <div style={{ marginTop: 24, padding: 16, border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 8 }}>
          <h3 style={{ marginTop: 0, fontSize: 14, fontWeight: 700, color: "#166534" }}>Promotion summary</h3>
          <table style={{ fontSize: 13, color: "#166534" }}>
            <tbody>
              {Object.entries(result)
                .filter(([k, v]) => k !== "skipped" && typeof v === "number" && (v as number) > 0)
                .map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ paddingRight: 16, fontFamily: "monospace" }}>{k.replace(/_/g, " ")}</td>
                    <td style={{ fontWeight: 600 }}>{v as number}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {Array.isArray(result.skipped) && result.skipped.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#7f1d1d" }}>
              <strong>{result.skipped.length} item(s) skipped:</strong>
              <ul style={{ marginTop: 4, marginBottom: 0 }}>
                {result.skipped.map((s, i) => (
                  <li key={i}>{s.kind} {s.id} — {s.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function filterRows<T>(rows: T[], query: string, fields: (row: T) => Array<string | null>): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => fields(r).some((f) => f?.toLowerCase().includes(q)));
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px", border: "none", background: "transparent",
        fontSize: 13, fontWeight: active ? 600 : 500,
        color: active ? "#0f172a" : "#64748b",
        borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
        cursor: "pointer", marginRight: 4,
      }}
    >
      {label}
    </button>
  );
}

function CheckCell({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ cursor: disabled ? "not-allowed" : "pointer" }} />
  );
}

function toggleSet<T>(set: Set<T>, value: T, on: boolean): Set<T> {
  const next = new Set(set);
  if (on) next.add(value); else next.delete(value);
  return next;
}

function SolutionsTable({ rows, selected, setSelected }: { rows: Solution[]; selected: Set<string>; setSelected: (s: Set<string>) => void }) {
  const eligible = rows.filter((r) => !r.already_on_prod);
  const allOn = eligible.length > 0 && eligible.every((r) => selected.has(r.id));
  return (
    <Table>
      <thead>
        <tr>
          <Th width={32}>
            <CheckCell
              checked={allOn}
              onChange={(v) => setSelected(v ? new Set(eligible.map((r) => r.id)) : new Set())}
            />
          </Th>
          <Th>Solution</Th>
          <Th>Customer</Th>
          <Th>Vendor</Th>
          <Th>Status</Th>
          <Th>Counts</Th>
          <Th>Created</Th>
          <Th>State</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={r.already_on_prod ? { color: "#94a3b8" } : undefined}>
            <Td>
              <CheckCell
                checked={selected.has(r.id)}
                disabled={r.already_on_prod}
                onChange={(v) => setSelected(toggleSet(selected, r.id, v))}
              />
            </Td>
            <Td>{r.name}</Td>
            <Td>{r.customer_name ?? "—"}</Td>
            <Td>{r.vendor ?? "—"}</Td>
            <Td>{r.status ?? "—"}</Td>
            <Td style={{ fontSize: 11, color: "#64748b" }}>
              NA:{r.needs_assessment_count} · Labor:{r.labor_estimate_count} · Contacts:{r.contact_count}
            </Td>
            <Td>{fmtDate(r.created_at)}</Td>
            <Td>{r.already_on_prod ? <Badge tone="muted">on prod</Badge> : <Badge tone="ok">staging only</Badge>}</Td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><Td colSpan={8} style={{ textAlign: "center", color: "#94a3b8", padding: 24 }}>No solutions match.</Td></tr>
        )}
      </tbody>
    </Table>
  );
}

function ProjectsTable({ rows, selected, setSelected }: { rows: Project[]; selected: Set<string>; setSelected: (s: Set<string>) => void }) {
  const eligible = rows.filter((r) => !r.already_on_prod);
  const allOn = eligible.length > 0 && eligible.every((r) => selected.has(r.id));
  return (
    <Table>
      <thead>
        <tr>
          <Th width={32}>
            <CheckCell
              checked={allOn}
              onChange={(v) => setSelected(v ? new Set(eligible.map((r) => r.id)) : new Set())}
            />
          </Th>
          <Th>Project</Th>
          <Th>Customer</Th>
          <Th>Vendor</Th>
          <Th>Status</Th>
          <Th>Counts</Th>
          <Th>Created</Th>
          <Th>State</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={r.already_on_prod ? { color: "#94a3b8" } : undefined}>
            <Td>
              <CheckCell
                checked={selected.has(r.id)}
                disabled={r.already_on_prod}
                onChange={(v) => setSelected(toggleSet(selected, r.id, v))}
              />
            </Td>
            <Td>{r.name}</Td>
            <Td>{r.customer_name ?? "—"}</Td>
            <Td>{r.vendor ?? "—"}</Td>
            <Td>{r.status ?? "—"}</Td>
            <Td style={{ fontSize: 11, color: "#64748b" }}>
              Stages:{r.stage_count} · Tasks:{r.task_count} · Risks:{r.risk_count} · Docs:{r.document_count}
            </Td>
            <Td>{fmtDate(r.created_at)}</Td>
            <Td>{r.already_on_prod ? <Badge tone="muted">on prod</Badge> : <Badge tone="ok">staging only</Badge>}</Td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><Td colSpan={8} style={{ textAlign: "center", color: "#94a3b8", padding: 24 }}>No projects match.</Td></tr>
        )}
      </tbody>
    </Table>
  );
}

function OptimizeTable({ rows, selected, setSelected }: { rows: OptimizeAccount[]; selected: Set<string>; setSelected: (s: Set<string>) => void }) {
  const eligible = rows.filter((r) => !r.already_on_prod);
  const allOn = eligible.length > 0 && eligible.every((r) => selected.has(r.id));
  return (
    <Table>
      <thead>
        <tr>
          <Th width={32}>
            <CheckCell
              checked={allOn}
              onChange={(v) => setSelected(v ? new Set(eligible.map((r) => r.id)) : new Set())}
            />
          </Th>
          <Th>Project</Th>
          <Th>Customer</Th>
          <Th>Graduated</Th>
          <Th>Counts</Th>
          <Th>State</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={r.already_on_prod ? { color: "#94a3b8" } : undefined}>
            <Td>
              <CheckCell
                checked={selected.has(r.id)}
                disabled={r.already_on_prod}
                onChange={(v) => setSelected(toggleSet(selected, r.id, v))}
              />
            </Td>
            <Td>{r.project_name}</Td>
            <Td>{r.customer_name ?? "—"}</Td>
            <Td>{fmtDate(r.graduated_at)}</Td>
            <Td style={{ fontSize: 11, color: "#64748b" }}>
              IA:{r.impact_assessment_count} · TechStack:{r.tech_stack_count} · Roadmap:{r.roadmap_count} · Util:{r.utilization_count}
            </Td>
            <Td>{r.already_on_prod ? <Badge tone="muted">on prod</Badge> : <Badge tone="ok">staging only</Badge>}</Td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><Td colSpan={6} style={{ textAlign: "center", color: "#94a3b8", padding: 24 }}>No optimize accounts match.</Td></tr>
        )}
      </tbody>
    </Table>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 6 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>{children}</table>
    </div>
  );
}
function Th({ children, width }: { children: React.ReactNode; width?: number }) {
  return (
    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", width }}>
      {children}
    </th>
  );
}
function Td({ children, style, colSpan }: { children: React.ReactNode; style?: React.CSSProperties; colSpan?: number }) {
  return (
    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top", ...style }} colSpan={colSpan}>
      {children}
    </td>
  );
}
function Badge({ children, tone }: { children: React.ReactNode; tone: "ok" | "muted" }) {
  const bg = tone === "ok" ? "#dcfce7" : "#f1f5f9";
  const fg = tone === "ok" ? "#166534" : "#64748b";
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600 }}>
      {children}
    </span>
  );
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}
