/**
 * Retroactively link an Optimize account to a different (existing) project.
 *
 * Direct-enrolled Optimize accounts get a shell project row at creation. If
 * the CSM later discovers a real implementation project exists, they can
 * point the Optimize account at it from here. The server moves impact
 * assessments / tech stack / roadmap / utilization snapshots / KV creds
 * along with the link and deletes the shell project when it has no
 * attached work — see /api/optimize/accounts/:projectId/relink.
 *
 * The Optimize URL is keyed on project_id, so after a successful relink we
 * navigate to /optimize/<new project_id>.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Project } from "../../lib/api";
import { vendorLabel } from "../../../shared/vendors";
import { useToast } from "../ui/ToastProvider";

type Props = {
  /** The Optimize account's CURRENT project id (the one we're relinking away from). */
  currentProjectId: string;
  /** The Optimize account's customer name — used to bias the project list. */
  customerName: string | null;
  onClose: () => void;
};

export default function OptimizeRelinkModal({ currentProjectId, customerName, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);
  const [relinking, setRelinking] = useState(false);

  useEffect(() => {
    api.projects()
      .then((p) => setProjects(p))
      .catch(() => showToast("Failed to load projects", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  // Filter out the current project + apply the search query. When no query is
  // entered, surface same-customer projects first as a discovery hint.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => p.id !== currentProjectId);
    if (q) {
      return list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.customer_name?.toLowerCase() ?? "").includes(q)
      );
    }
    // No query: same-customer first, then everything else, by updated_at DESC
    // (already the order from /api/projects).
    if (customerName) {
      const norm = customerName.trim().toLowerCase();
      const same = list.filter((p) => p.customer_name?.trim().toLowerCase() === norm);
      const other = list.filter((p) => p.customer_name?.trim().toLowerCase() !== norm);
      return [...same, ...other];
    }
    return list;
  }, [projects, currentProjectId, customerName, query]);

  async function handleConfirm() {
    if (!selected) return;
    setRelinking(true);
    try {
      const result = await api.optimizeRelink(currentProjectId, selected.id);
      const moved = result.credentials_moved.length > 0
        ? ` Credentials moved: ${result.credentials_moved.join(", ")}.`
        : "";
      const deleted = result.shell_deleted ? " Shell project removed." : "";
      showToast(`Linked to ${selected.name}.${moved}${deleted}`, "success");
      // URL is keyed on project_id; navigate to the new one. Page remounts.
      navigate(`/optimize/${result.project_id}`, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to relink";
      showToast(msg, "error");
      setRelinking(false);
    }
  }

  return (
    <div className="ms-modal-overlay" onClick={onClose}>
      <div className="ms-modal" style={{ maxWidth: 720, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>Link to an existing project</h3>
        <p style={{ fontSize: 13, color: "#475569", margin: "0 0 14px" }}>
          Move this Optimize account to point at a different project. Impact assessments, tech stack, roadmap items, utilization snapshots, and Zoom / RingCentral credentials all move with it. The current shell project is deleted when it has no attached work.
        </p>

        <input
          className="ms-input"
          placeholder="Search by project name or customer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 12 }}
          autoFocus
        />

        <div style={{ overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 6, flex: 1, minHeight: 200 }}>
          {loading ? (
            <div style={{ padding: 20, color: "#94a3b8", fontSize: 13, textAlign: "center" }}>Loading projects…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
              {query ? "No projects match that search." : "No other projects available."}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#475569", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px" }}>Project</th>
                  <th style={{ padding: "8px 12px" }}>Customer</th>
                  <th style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>Vendor</th>
                  <th style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>Go-Live</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isSelected = selected?.id === p.id;
                  const sameCustomer = customerName
                    && p.customer_name?.trim().toLowerCase() === customerName.trim().toLowerCase();
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(p)}
                      style={{
                        cursor: "pointer",
                        background: isSelected ? "rgba(11,154,173,0.1)" : sameCustomer && !query ? "rgba(11,154,173,0.03)" : "transparent",
                        borderTop: "1px solid #f1f5f9",
                      }}
                    >
                      <td style={{ padding: "8px 12px", color: "#1e293b", fontWeight: isSelected ? 600 : 500 }}>
                        {p.name}
                        {sameCustomer && !query && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#0b9aad", letterSpacing: "0.06em" }}>same customer</span>}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#64748b" }}>{p.customer_name ?? "—"}</td>
                      <td style={{ padding: "8px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{vendorLabel(p.vendor) || "—"}</td>
                      <td style={{ padding: "8px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{p.target_go_live_date ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13 }}>
            <span style={{ color: "#475569" }}>Will link to </span>
            <strong style={{ color: "#1e293b" }}>{selected.name}</strong>
            {selected.customer_name && <span style={{ color: "#64748b" }}> · {selected.customer_name}</span>}
            {selected.vendor && <span style={{ color: "#64748b" }}> · {vendorLabel(selected.vendor)}</span>}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="ms-btn-secondary" onClick={onClose} disabled={relinking}>Cancel</button>
          <button
            className="ms-btn-primary"
            onClick={handleConfirm}
            disabled={!selected || relinking}
            style={{ background: "#0891b2" }}
          >
            {relinking ? "Linking…" : "Confirm link"}
          </button>
        </div>
      </div>
    </div>
  );
}
