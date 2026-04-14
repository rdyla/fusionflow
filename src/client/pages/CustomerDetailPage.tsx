import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  type Customer,
  type CustomerContact,
  type CustomerProviderAe,
  type Solution,
  type Project,
  type User,
} from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";
import SharePointDocs from "../components/sharepoint/SharePointDocs";

type Tab = "overview" | "solutions" | "implementations" | "optimizations" | "documents";

type CustomerSolution = Pick<Solution, "id" | "name" | "vendor" | "solution_type" | "status" | "created_at" | "updated_at" | "linked_project_id">;
type CustomerProject = Pick<Project, "id" | "name" | "vendor" | "solution_type" | "status" | "health" | "kickoff_date" | "target_go_live_date" | "actual_go_live_date" | "created_at" | "updated_at"> & { has_optimization: number | null };
type CustomerOptimization = { id: string; project_id: string; optimize_status: string; graduated_at: string | null; next_review_date: string | null; project_name: string; vendor: string | null; solution_type: string | null; actual_go_live_date: string | null };

const SOLUTION_TYPE_LABELS: Record<string, string> = {
  ucaas: "UCaaS", ccaas: "CCaaS", ci: "Conversation Intelligence", va: "AI Virtual Agent",
};

const JOURNEY_LABELS: Record<string, string> = {
  zoom_ucaas: "UCaaS", zoom_ccaas: "CCaaS", zoom_rooms: "Zoom Rooms",
  zoom_zva: "ZVA", zoom_zra: "ZRA", zoom_qm: "QM", zoom_wfm: "WFM",
  zoom_ai_expert_assist: "AI Expert Assist", zoom_workvivo: "Workvivo",
  zoom_integrations: "Integrations / API",
  rc_ucaas: "UCaaS", rc_ccaas: "CCaaS", rc_air: "AIR", rc_ava: "AVA", rc_ace: "ACE",
  agnostic_ucaas: "UCaaS", agnostic_ccaas: "CCaaS",
  bdr: "Backup & Disaster Recovery", connectivity: "Connectivity",
  colocation: "Colocation", cyber_security: "Cyber Security",
  daas: "Desktop as a Service", help_desk: "Help Desk",
  iaas: "Infrastructure as a Service", mobility: "Mobility (Corporate Cellular)",
  managed_services: "Managed Services", managed_cloud: "Managed Public Cloud",
  sdwan: "SD-WAN / SASE / Aggregation", tem: "Technology Expense Management (TEM)",
  other: "Other Technology Discovery",
};

const VENDOR_JOURNEYS: Record<string, string[]> = {
  zoom: ["zoom_ucaas", "zoom_ccaas", "zoom_rooms", "zoom_zva", "zoom_zra", "zoom_qm", "zoom_wfm", "zoom_ai_expert_assist", "zoom_workvivo", "zoom_integrations"],
  ringcentral: ["rc_ucaas", "rc_ccaas", "rc_air", "rc_ava", "rc_ace"],
  agnostic: ["agnostic_ucaas", "agnostic_ccaas"],
};

const STANDALONE_JOURNEYS = [
  "bdr", "connectivity", "colocation", "cyber_security", "daas",
  "help_desk", "iaas", "mobility", "managed_services", "managed_cloud",
  "sdwan", "tem", "other",
];

function journeyBadgeText(journeysJson: string | null, solutionType: string): string {
  if (!journeysJson) return SOLUTION_TYPE_LABELS[solutionType] ?? solutionType;
  try {
    const journeys: string[] = JSON.parse(journeysJson);
    if (!journeys.length) return SOLUTION_TYPE_LABELS[solutionType] ?? solutionType;
    const labels = journeys.slice(0, 3).map(j => JOURNEY_LABELS[j] ?? j);
    return labels.join(" · ") + (journeys.length > 3 ? ` +${journeys.length - 3}` : "");
  } catch { return SOLUTION_TYPE_LABELS[solutionType] ?? solutionType; }
}

const HEALTH_COLOR: Record<string, string> = {
  on_track: "#107c10", at_risk: "#ff8c00", off_track: "#d13438",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "#94a3b8", assessment: "#0891b2", requirements: "#8764b8",
  scope: "#ff8c00", handoff: "#63c1ea", won: "#107c10", lost: "#d13438",
  not_started: "#94a3b8", planning: "#0891b2", in_progress: "#ff8c00",
  completed: "#107c10", on_hold: "#d13438",
};

function fmt(d: string | null) {
  if (!d) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T00:00:00" : d;
  return new Date(normalized).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function capitalize(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [providerAes, setProviderAes] = useState<CustomerProviderAe[]>([]);
  const [solutions, setSolutions] = useState<CustomerSolution[]>([]);
  const [projects, setProjects] = useState<CustomerProject[]>([]);
  const [optimizations, setOptimizations] = useState<CustomerOptimization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pfTeamPhotoMap, setPfTeamPhotoMap] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [crmSyncing, setCrmSyncing] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ sharepoint_url: "", pf_ae_user_id: "", pf_sa_user_id: "", pf_csm_user_id: "" });
  const [saving, setSaving] = useState(false);

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", job_title: "", contact_role: "" });
  const [savingContact, setSavingContact] = useState(false);

  // Provider AE form
  const [showAeForm, setShowAeForm] = useState(false);
  const [aeForm, setAeForm] = useState({ name: "", company: "", email: "", phone: "" });
  const [savingAe, setSavingAe] = useState(false);

  // New Solution modal
  const [showNewSolution, setShowNewSolution] = useState(false);
  const [newSolutionForm, setNewSolutionForm] = useState<{ journeys: string[]; ucaas_vendor: "" | "zoom" | "ringcentral" | "agnostic" }>({ journeys: [], ucaas_vendor: "" });
  const [creatingSolution, setCreatingSolution] = useState(false);

  // New Implementation modal
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectForm, setNewProjectForm] = useState({ name: "", solution_type: "", vendor: "tbd", target_go_live_date: "" });
  const [creatingProject, setCreatingProject] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.users().then(setUsers).catch(() => {}); // admin-only; non-admins get empty list gracefully
    Promise.all([
      api.customer(id),
      api.customerContacts(id),
      api.customerProviderAes(id),
      api.customerSolutions(id),
      api.customerProjects(id) as unknown as Promise<CustomerProject[]>,
      api.customerOptimizations(id),
    ])
      .then(([c, ct, ae, s, p, o]) => {
        setCustomer(c);
        setContacts(ct);
        setProviderAes(ae);
        setSolutions(s);
        setProjects(p);
        setOptimizations(o);
        setEditForm({
          sharepoint_url: c.sharepoint_url ?? "",
          pf_ae_user_id: c.pf_ae_user_id ?? "",
          pf_sa_user_id: c.pf_sa_user_id ?? "",
          pf_csm_user_id: c.pf_csm_user_id ?? "",
        });
        // Fetch PF team headshots
        const teamEmails = [c.pf_ae_email, c.pf_sa_email, c.pf_csm_email].filter(Boolean) as string[];
        if (teamEmails.length > 0) {
          api.staffPhotos(teamEmails).then(setPfTeamPhotoMap).catch(() => {});
        }
      })
      .catch(() => showToast("Failed to load customer", "error"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSaveEdit() {
    if (!id || !customer) return;
    setSaving(true);
    try {
      const updated = await api.updateCustomer(id, {
        sharepoint_url: editForm.sharepoint_url || null,
        pf_ae_user_id: editForm.pf_ae_user_id || null,
        pf_sa_user_id: editForm.pf_sa_user_id || null,
        pf_csm_user_id: editForm.pf_csm_user_id || null,
      });
      setCustomer(updated);
      setEditing(false);
      showToast("Customer updated.", "success");
    } catch {
      showToast("Failed to save changes", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCrmSync() {
    if (!id) return;
    setCrmSyncing(true);
    try {
      const { customer: updated } = await api.customerCrmSync(id);
      setCustomer(updated);
      setEditForm((f) => ({
        ...f,
        pf_ae_user_id: updated.pf_ae_user_id ?? "",
        pf_sa_user_id: updated.pf_sa_user_id ?? "",
        pf_csm_user_id: updated.pf_csm_user_id ?? "",
      }));
      const teamEmails = [updated.pf_ae_email, updated.pf_sa_email, updated.pf_csm_email].filter(Boolean) as string[];
      if (teamEmails.length > 0) api.staffPhotos(teamEmails).then(setPfTeamPhotoMap).catch(() => {});
      showToast("Team synced from CRM.", "success");
    } catch {
      showToast("CRM sync failed", "error");
    } finally {
      setCrmSyncing(false);
    }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSavingContact(true);
    try {
      const c = await api.addCustomerContact(id, {
        name: contactForm.name,
        email: contactForm.email || null,
        phone: contactForm.phone || null,
        job_title: contactForm.job_title || null,
        contact_role: contactForm.contact_role || null,
      });
      setContacts((prev) => [...prev, c]);
      setContactForm({ name: "", email: "", phone: "", job_title: "", contact_role: "" });
      setShowContactForm(false);
      showToast("Contact added.", "success");
    } catch {
      showToast("Failed to add contact", "error");
    } finally {
      setSavingContact(false);
    }
  }

  async function handleDeleteContact(contactId: string) {
    if (!id) return;
    try {
      await api.deleteCustomerContact(id, contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch {
      showToast("Failed to remove contact", "error");
    }
  }

  async function handleAddAe(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSavingAe(true);
    try {
      const ae = await api.addCustomerProviderAe(id, {
        name: aeForm.name,
        company: aeForm.company || null,
        email: aeForm.email || null,
        phone: aeForm.phone || null,
      });
      setProviderAes((prev) => [...prev, ae]);
      setAeForm({ name: "", company: "", email: "", phone: "" });
      setShowAeForm(false);
      showToast("Provider AE added.", "success");
    } catch {
      showToast("Failed to add provider AE", "error");
    } finally {
      setSavingAe(false);
    }
  }

  async function handleDeleteAe(aeId: string) {
    if (!id) return;
    try {
      await api.deleteCustomerProviderAe(id, aeId);
      setProviderAes((prev) => prev.filter((a) => a.id !== aeId));
    } catch {
      showToast("Failed to remove provider AE", "error");
    }
  }

  async function handleCreateSolution(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    if (!newSolutionForm.journeys.length) { showToast("Select at least one journey.", "error"); return; }
    setCreatingSolution(true);
    try {
      const sol = await api.createSolution({
        customer_name: customer.name,
        customer_id: customer.id,
        journeys: newSolutionForm.journeys,
        pf_ae_user_id: customer.pf_ae_user_id ?? undefined,
        pf_sa_user_id: customer.pf_sa_user_id ?? undefined,
        pf_csm_user_id: customer.pf_csm_user_id ?? undefined,
      });
      navigate(`/solutions/${sol.id}`);
    } catch {
      showToast("Failed to create solution", "error");
      setCreatingSolution(false);
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    setCreatingProject(true);
    try {
      const proj = await api.createProject({
        name: newProjectForm.name || `${customer.name} Implementation`,
        customer_name: customer.name,
        customer_id: customer.id,
        solution_type: newProjectForm.solution_type || undefined,
        vendor: newProjectForm.vendor || undefined,
        target_go_live_date: newProjectForm.target_go_live_date || undefined,
      });
      navigate(`/projects/${proj.id}`);
    } catch {
      showToast("Failed to create implementation", "error");
      setCreatingProject(false);
    }
  }

  const pfAes = users.filter((u) => u.role === "pf_ae");
  const pfSas = users.filter((u) => u.role === "pf_sa");
  const pfCsms = users.filter((u) => u.role === "pf_csm");

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading…</div>;
  if (!customer) return <div style={{ color: "#d13438", padding: 32 }}>Customer not found.</div>;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "solutions", label: "Solutions", count: solutions.length },
    { id: "implementations", label: "Implementations", count: projects.length },
    { id: "optimizations", label: "Optimizations", count: optimizations.length },
    ...(customer.crm_account_id ? [{ id: "documents" as Tab, label: "Documents" }] : []),
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => navigate("/customers")}
          style={{ background: "none", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}
        >
          ← Customers
        </button>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1e293b", margin: 0 }}>{customer.name}</h1>
            {(customer.address_city || customer.address_state) && (
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                {[customer.address_city, customer.address_state].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="ms-btn-secondary"
              onClick={handleCrmSync}
              disabled={crmSyncing}
              style={{ fontSize: 13 }}
            >
              {crmSyncing ? "Syncing…" : "Sync from CRM"}
            </button>
            <button
              className="ms-btn-primary"
              onClick={() => setEditing(true)}
              style={{ fontSize: 13 }}
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, borderBottom: "2px solid #e2e8f0", marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 18px", fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "#0b9aad" : "#64748b",
              borderBottom: tab === t.id ? "2px solid #0b9aad" : "2px solid transparent",
              marginBottom: -2,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, background: tab === t.id ? "rgba(11,154,173,0.12)" : "#f1f5f9", color: tab === t.id ? "#0b9aad" : "#64748b", borderRadius: 10, padding: "0 6px" }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* PF Team */}
          <div className="ms-card">
            <div style={{ fontWeight: 700, fontSize: 13, color: "#475569", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.06em" }}>PF Team</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Account Executive", name: customer.pf_ae_name, email: customer.pf_ae_email },
                { label: "Solution Architect", name: customer.pf_sa_name, email: customer.pf_sa_email },
                { label: "Customer Success", name: customer.pf_csm_name, email: customer.pf_csm_email },
              ].map(({ label, name, email }) => {
                const photo = email ? pfTeamPhotoMap[email] : null;
                const abbr = name ? name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase() : "?";
                return (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                    {photo
                      ? <img src={photo} alt={name ?? ""} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, rgba(0,120,212,0.3), rgba(99,193,234,0.2))", border: "1px solid rgba(99,193,234,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#63c1ea" }}>{name ? abbr : "—"}</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 2 }}>{label}</div>
                      {name ? (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{name}</div>
                          {email && <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{email}</div>}
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: "#94a3b8" }}>Unassigned</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {customer.sharepoint_url && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 6 }}>SharePoint</div>
                <a
                  href={customer.sharepoint_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#0b9aad", textDecoration: "none", fontWeight: 600, background: "rgba(11,154,173,0.06)", border: "1px solid rgba(11,154,173,0.2)", borderRadius: 6, padding: "6px 12px" }}
                >
                  Open SharePoint ↗
                </a>
              </div>
            )}
          </div>

          {/* Provider AEs */}
          <div className="ms-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Provider AEs</div>
              <button className="ms-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setShowAeForm(true)}>+ Add</button>
            </div>
            {providerAes.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>No provider AEs yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {providerAes.map((ae) => (
                  <div key={ae.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{ae.name}</div>
                      {ae.company && <div style={{ fontSize: 12, color: "#0b9aad", fontWeight: 600 }}>{ae.company}</div>}
                      {ae.email && <div style={{ fontSize: 12, color: "#64748b" }}>{ae.email}</div>}
                      {ae.phone && <div style={{ fontSize: 12, color: "#64748b" }}>{ae.phone}</div>}
                    </div>
                    <button
                      onClick={() => handleDeleteAe(ae.id)}
                      style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, padding: "0 4px", flexShrink: 0 }}
                      title="Remove"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Customer Contacts */}
          <div className="ms-card" style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Customer Contacts</div>
              <button className="ms-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setShowContactForm(true)}>+ Add</button>
            </div>
            {contacts.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>No contacts yet.</div>
            ) : (
              <table className="ms-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Role</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((ct) => (
                    <tr key={ct.id}>
                      <td style={{ fontWeight: 600, color: "#1e293b" }}>{ct.name}</td>
                      <td style={{ color: "#64748b", fontSize: 13 }}>{ct.job_title ?? "—"}</td>
                      <td style={{ color: "#64748b", fontSize: 13 }}>{ct.contact_role ?? "—"}</td>
                      <td style={{ color: "#64748b", fontSize: 13 }}>{ct.email ?? "—"}</td>
                      <td style={{ color: "#64748b", fontSize: 13 }}>{ct.phone ?? "—"}</td>
                      <td>
                        <button
                          onClick={() => handleDeleteContact(ct.id)}
                          style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}
                          title="Remove"
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Solutions Tab */}
      {tab === "solutions" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="ms-btn ms-btn-primary" onClick={() => setShowNewSolution(true)}>+ New Solution</button>
          </div>
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <table className="ms-table">
            <thead>
              <tr>
                <th>Solution</th>
                <th>Technology</th>
                <th>Stage</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {solutions.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "#94a3b8", padding: "28px 16px" }}>No solutions linked to this customer.</td></tr>
              ) : solutions.map((s) => (
                <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/solutions/${s.id}`)}>
                  <td style={{ fontWeight: 600, color: "#1e293b" }}>{s.name}</td>
                  <td>
                    <span className="ms-badge" style={{ background: "rgba(99,193,234,0.12)", color: "#0891b2", border: "1px solid rgba(99,193,234,0.25)" }}>
                      {journeyBadgeText((s as Solution & { journeys?: string | null }).journeys ?? null, s.solution_type)}
                    </span>
                  </td>
                  <td>
                    <span className="ms-badge" style={{ background: `${STATUS_COLOR[s.status] ?? "#94a3b8"}1a`, color: STATUS_COLOR[s.status] ?? "#94a3b8", border: `1px solid ${STATUS_COLOR[s.status] ?? "#94a3b8"}40` }}>
                      {capitalize(s.status)}
                    </span>
                  </td>
                  <td style={{ color: "#94a3b8", fontSize: 12 }}>{fmt(s.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* Implementations Tab */}
      {tab === "implementations" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="ms-btn ms-btn-primary" onClick={() => setShowNewProject(true)}>+ New Implementation</button>
          </div>
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <table className="ms-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Technology</th>
                <th>Status</th>
                <th>Health</th>
                <th>Go-Live</th>
                <th>Optimizing</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "#94a3b8", padding: "28px 16px" }}>No implementations linked to this customer.</td></tr>
              ) : projects.map((p) => (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/projects/${p.id}`)}>
                  <td style={{ fontWeight: 600, color: "#1e293b" }}>{p.name}</td>
                  <td style={{ color: "#64748b", fontSize: 13 }}>
                    {p.solution_type ? (SOLUTION_TYPE_LABELS[p.solution_type] ?? p.solution_type) : "—"}
                  </td>
                  <td>
                    <span className="ms-badge" style={{ background: `${STATUS_COLOR[p.status ?? ""] ?? "#94a3b8"}1a`, color: STATUS_COLOR[p.status ?? ""] ?? "#94a3b8", border: `1px solid ${STATUS_COLOR[p.status ?? ""] ?? "#94a3b8"}40` }}>
                      {capitalize(p.status ?? "—")}
                    </span>
                  </td>
                  <td>
                    {p.health ? (
                      <span className="ms-badge" style={{ background: `${HEALTH_COLOR[p.health] ?? "#94a3b8"}1a`, color: HEALTH_COLOR[p.health] ?? "#94a3b8", border: `1px solid ${HEALTH_COLOR[p.health] ?? "#94a3b8"}40` }}>
                        {capitalize(p.health)}
                      </span>
                    ) : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ color: "#64748b", fontSize: 13 }}>{fmt(p.target_go_live_date)}</td>
                  <td>
                    {p.has_optimization ? (
                      <span className="ms-badge" style={{ background: "rgba(16,124,16,0.1)", color: "#107c10", border: "1px solid rgba(16,124,16,0.3)" }}>Yes</span>
                    ) : <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* Optimizations Tab */}
      {tab === "optimizations" && (
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <table className="ms-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Technology</th>
                <th>Status</th>
                <th>Go-Live</th>
                <th>Next Review</th>
              </tr>
            </thead>
            <tbody>
              {optimizations.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "#94a3b8", padding: "28px 16px" }}>No optimizations linked to this customer.</td></tr>
              ) : optimizations.map((o) => (
                <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/optimize/${o.project_id}`)}>
                  <td style={{ fontWeight: 600, color: "#1e293b" }}>{o.project_name}</td>
                  <td style={{ color: "#64748b", fontSize: 13 }}>
                    {o.solution_type ? (SOLUTION_TYPE_LABELS[o.solution_type] ?? o.solution_type) : "—"}
                  </td>
                  <td>
                    <span className="ms-badge" style={{
                      background: o.optimize_status === "active" ? "rgba(16,124,16,0.1)" : o.optimize_status === "churned" ? "rgba(209,52,56,0.1)" : "rgba(255,140,0,0.1)",
                      color: o.optimize_status === "active" ? "#107c10" : o.optimize_status === "churned" ? "#d13438" : "#ff8c00",
                      border: `1px solid ${o.optimize_status === "active" ? "rgba(16,124,16,0.3)" : o.optimize_status === "churned" ? "rgba(209,52,56,0.3)" : "rgba(255,140,0,0.3)"}`,
                    }}>
                      {capitalize(o.optimize_status)}
                    </span>
                  </td>
                  <td style={{ color: "#64748b", fontSize: 13 }}>{fmt(o.actual_go_live_date)}</td>
                  <td style={{ color: "#64748b", fontSize: 13 }}>{fmt(o.next_review_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Documents Tab */}
      {tab === "documents" && customer.crm_account_id && (
        <SharePointDocs recordId={customer.crm_account_id} sharepointUrl={customer.sharepoint_url} />
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditing(false); }}>
          <div className="ms-modal" style={{ maxWidth: 480 }}>
            <h2>Edit Customer</h2>
            <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
              <label className="ms-label">
                <span>SharePoint URL</span>
                <input className="ms-input" placeholder="https://..." value={editForm.sharepoint_url} onChange={(e) => setEditForm((f) => ({ ...f, sharepoint_url: e.target.value }))} />
              </label>
              <label className="ms-label">
                <span>PF Account Executive</span>
                <select className="ms-input" value={editForm.pf_ae_user_id} onChange={(e) => setEditForm((f) => ({ ...f, pf_ae_user_id: e.target.value }))}>
                  <option value="">— Unassigned —</option>
                  {pfAes.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                </select>
              </label>
              <label className="ms-label">
                <span>Solution Architect</span>
                <select className="ms-input" value={editForm.pf_sa_user_id} onChange={(e) => setEditForm((f) => ({ ...f, pf_sa_user_id: e.target.value }))}>
                  <option value="">— Unassigned —</option>
                  {pfSas.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                </select>
              </label>
              <label className="ms-label">
                <span>Customer Success Manager</span>
                <select className="ms-input" value={editForm.pf_csm_user_id} onChange={(e) => setEditForm((f) => ({ ...f, pf_csm_user_id: e.target.value }))}>
                  <option value="">— Unassigned —</option>
                  {pfCsms.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button className="ms-btn-primary" onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                <button className="ms-btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showContactForm && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowContactForm(false); }}>
          <div className="ms-modal" style={{ maxWidth: 480 }}>
            <h2>Add Contact</h2>
            <form onSubmit={handleAddContact} style={{ display: "grid", gap: 14, marginTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="ms-label">
                  <span>Name *</span>
                  <input autoFocus className="ms-input" required value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label className="ms-label">
                  <span>Title</span>
                  <input className="ms-input" value={contactForm.job_title} onChange={(e) => setContactForm((f) => ({ ...f, job_title: e.target.value }))} />
                </label>
                <label className="ms-label">
                  <span>Role</span>
                  <input className="ms-input" placeholder="e.g. Champion, Sponsor" value={contactForm.contact_role} onChange={(e) => setContactForm((f) => ({ ...f, contact_role: e.target.value }))} />
                </label>
                <label className="ms-label">
                  <span>Email</span>
                  <input className="ms-input" type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} />
                </label>
                <label className="ms-label">
                  <span>Phone</span>
                  <input className="ms-input" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={savingContact || !contactForm.name.trim()}>{savingContact ? "Adding…" : "Add Contact"}</button>
                <button type="button" className="ms-btn-secondary" onClick={() => setShowContactForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Provider AE Modal */}
      {showAeForm && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAeForm(false); }}>
          <div className="ms-modal" style={{ maxWidth: 440 }}>
            <h2>Add Provider AE</h2>
            <form onSubmit={handleAddAe} style={{ display: "grid", gap: 14, marginTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="ms-label">
                  <span>Name *</span>
                  <input autoFocus className="ms-input" required value={aeForm.name} onChange={(e) => setAeForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label className="ms-label">
                  <span>Company / Vendor</span>
                  <input className="ms-input" placeholder="e.g. Zoom, Cato Networks" value={aeForm.company} onChange={(e) => setAeForm((f) => ({ ...f, company: e.target.value }))} />
                </label>
                <label className="ms-label">
                  <span>Email</span>
                  <input className="ms-input" type="email" value={aeForm.email} onChange={(e) => setAeForm((f) => ({ ...f, email: e.target.value }))} />
                </label>
                <label className="ms-label">
                  <span>Phone</span>
                  <input className="ms-input" value={aeForm.phone} onChange={(e) => setAeForm((f) => ({ ...f, phone: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={savingAe || !aeForm.name.trim()}>{savingAe ? "Adding…" : "Add Provider AE"}</button>
                <button type="button" className="ms-btn-secondary" onClick={() => setShowAeForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Solution Modal */}
      {showNewSolution && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowNewSolution(false); }}>
          <div className="ms-modal" style={{ maxWidth: 440 }}>
            <h2>New Solution</h2>
            <p style={{ fontSize: 13, color: "#64748b", marginTop: 4, marginBottom: 16 }}>
              Starting a solution for <strong>{customer.name}</strong>. The PF team will be pre-populated from the customer record.
            </p>
            <form onSubmit={handleCreateSolution} style={{ display: "grid", gap: 14 }}>
              <div className="ms-label">
                <span>Core Journey *</span>
                {/* UCaaS / CCaaS */}
                <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "12px 14px", marginBottom: 8, background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#03395f", marginBottom: 10 }}>UCaaS / CCaaS</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    {(["zoom", "ringcentral", "agnostic"] as const).map((v) => {
                      const labels: Record<string, string> = { zoom: "Zoom", ringcentral: "RingCentral", agnostic: "Agnostic" };
                      const active = newSolutionForm.ucaas_vendor === v;
                      return (
                        <button key={v} type="button"
                          onClick={() => {
                            const prevKeys = newSolutionForm.ucaas_vendor ? VENDOR_JOURNEYS[newSolutionForm.ucaas_vendor] ?? [] : [];
                            setNewSolutionForm((f) => ({
                              ...f,
                              ucaas_vendor: active ? "" : v,
                              journeys: f.journeys.filter(j => !prevKeys.includes(j)),
                            }));
                          }}
                          style={{ padding: "4px 12px", fontSize: 12, borderRadius: 4, border: `1px solid ${active ? "#03395f" : "rgba(0,0,0,0.12)"}`, background: active ? "#03395f" : "transparent", color: active ? "#fff" : "#64748b", cursor: "pointer", fontWeight: active ? 600 : 400 }}>
                          {labels[v]}
                        </button>
                      );
                    })}
                  </div>
                  {newSolutionForm.ucaas_vendor ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
                      {(VENDOR_JOURNEYS[newSolutionForm.ucaas_vendor] ?? []).map((key) => {
                        const checked = newSolutionForm.journeys.includes(key);
                        return (
                          <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer", userSelect: "none" }}>
                            <input type="checkbox" checked={checked}
                              onChange={(e) => setNewSolutionForm((f) => ({
                                ...f,
                                journeys: e.target.checked ? [...f.journeys, key] : f.journeys.filter(j => j !== key),
                              }))}
                              style={{ accentColor: "#03395f" }}
                            />
                            {JOURNEY_LABELS[key]}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Select a vendor above to choose sub-technologies.</div>
                  )}
                </div>
                {/* Standalone */}
                <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "12px 14px", background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#03395f", marginBottom: 10 }}>Other Technology</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
                    {STANDALONE_JOURNEYS.map((key) => {
                      const checked = newSolutionForm.journeys.includes(key);
                      return (
                        <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer", userSelect: "none" }}>
                          <input type="checkbox" checked={checked}
                            onChange={(e) => setNewSolutionForm((f) => ({
                              ...f,
                              journeys: e.target.checked ? [...f.journeys, key] : f.journeys.filter(j => j !== key),
                            }))}
                            style={{ accentColor: "#03395f" }}
                          />
                          {JOURNEY_LABELS[key]}
                        </label>
                      );
                    })}
                  </div>
                </div>
                {newSolutionForm.journeys.length > 0 && (
                  <div style={{ fontSize: 11, color: "#63c1ea", marginTop: 6 }}>
                    {newSolutionForm.journeys.length} selected: {newSolutionForm.journeys.map(j => JOURNEY_LABELS[j] ?? j).join(", ")}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn ms-btn-primary" disabled={creatingSolution || !newSolutionForm.journeys.length}>{creatingSolution ? "Creating…" : "Start Solution"}</button>
                <button type="button" className="ms-btn" onClick={() => { setShowNewSolution(false); setNewSolutionForm({ journeys: [], ucaas_vendor: "" }); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Implementation Modal */}
      {showNewProject && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowNewProject(false); }}>
          <div className="ms-modal" style={{ maxWidth: 440 }}>
            <h2>New Implementation</h2>
            <p style={{ fontSize: 13, color: "#64748b", marginTop: 4, marginBottom: 16 }}>
              Starting an implementation project for <strong>{customer.name}</strong>.
            </p>
            <form onSubmit={handleCreateProject} style={{ display: "grid", gap: 14 }}>
              <label className="ms-label">
                <span>Project Name</span>
                <input
                  autoFocus
                  className="ms-input"
                  placeholder={`${customer.name} Implementation`}
                  value={newProjectForm.name}
                  onChange={(e) => setNewProjectForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="ms-label">
                <span>Technology</span>
                <select
                  className="ms-input"
                  value={newProjectForm.solution_type}
                  onChange={(e) => setNewProjectForm((f) => ({ ...f, solution_type: e.target.value }))}
                >
                  <option value="">— Select —</option>
                  <option value="ucaas">UCaaS</option>
                  <option value="ccaas">CCaaS</option>
                  <option value="ci">Conversation Intelligence</option>
                  <option value="va">AI Virtual Agent</option>
                </select>
              </label>
              <label className="ms-label">
                <span>Provider</span>
                <select
                  className="ms-input"
                  value={newProjectForm.vendor}
                  onChange={(e) => setNewProjectForm((f) => ({ ...f, vendor: e.target.value }))}
                >
                  <option value="tbd">TBD</option>
                  <option value="zoom">Zoom</option>
                  <option value="ringcentral">RingCentral</option>
                  <option value="cato">Cato Networks</option>
                  <option value="microsoft">Microsoft</option>
                  <option value="cisco">Cisco</option>
                </select>
              </label>
              <label className="ms-label">
                <span>Target Go-Live</span>
                <input
                  className="ms-input"
                  type="date"
                  value={newProjectForm.target_go_live_date}
                  onChange={(e) => setNewProjectForm((f) => ({ ...f, target_go_live_date: e.target.value }))}
                />
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn ms-btn-primary" disabled={creatingProject}>{creatingProject ? "Creating…" : "Start Implementation"}</button>
                <button type="button" className="ms-btn" onClick={() => setShowNewProject(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
