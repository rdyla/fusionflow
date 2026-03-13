import { useRef, useState } from "react";
import { api, DOCUMENT_CATEGORIES, type Document, type Phase, type Task } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

type Props = {
  projectId: string;
  documents: Document[];
  phases: Phase[];
  tasks: Task[];
  onDocumentsChange: (docs: Document[]) => void;
};

const FILE_ICONS: Record<string, string> = {
  "application/pdf": "📄",
  "application/vnd.ms-excel": "📊",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
  "application/msword": "📝",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
  "text/plain": "📃",
  "text/csv": "📊",
  "image/png": "🖼️",
  "image/jpeg": "🖼️",
};

function fileIcon(contentType: string | null) {
  if (!contentType) return "📎";
  return FILE_ICONS[contentType] ?? "📎";
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  "LOA":        { bg: "rgba(99,179,237,0.15)",  color: "#63b3ed" },
  "Cut Sheet":  { bg: "rgba(154,109,248,0.15)", color: "#9a6df8" },
  "CSR":        { bg: "rgba(67,209,122,0.15)",  color: "#43d17a" },
  "Contract":   { bg: "rgba(255,165,0,0.15)",   color: "#ffa500" },
  "Design Doc": { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b" },
  "Test Plan":  { bg: "rgba(59,130,246,0.15)",  color: "#3b82f6" },
  "Other":      { bg: "rgba(255,255,255,0.08)", color: "#9fb0d9" },
};

function categoryBadge(category: string | null): React.CSSProperties {
  const c = CATEGORY_COLORS[category ?? "Other"] ?? CATEGORY_COLORS["Other"];
  return { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: c.bg, color: c.color, whiteSpace: "nowrap" };
}

export default function ProjectDocuments({ projectId, documents, phases, tasks, onDocumentsChange }: Props) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    category: "Other",
    phase_id: "",
    task_id: "",
  });

  // Filter tasks by selected phase for the task dropdown
  const filteredTasks = uploadForm.phase_id
    ? tasks.filter((t) => t.phase_id === uploadForm.phase_id)
    : tasks;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    try {
      const created = await api.uploadDocument(projectId, {
        file: selectedFile,
        category: uploadForm.category,
        phase_id: uploadForm.phase_id || null,
        task_id: uploadForm.task_id || null,
      });
      onDocumentsChange([created, ...documents]);
      setSelectedFile(null);
      setUploadForm({ category: "Other", phase_id: "", task_id: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast("Document uploaded.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: Document) {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    try {
      await api.deleteDocument(projectId, doc.id);
      onDocumentsChange(documents.filter((d) => d.id !== doc.id));
      showToast("Document deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

  function handleDownload(doc: Document) {
    const url = api.downloadDocumentUrl(projectId, doc.id);
    // Open in a hidden link to trigger download with auth header
    // Since auth is header-based in dev, we need to fetch and blob it
    fetch(url, { headers: { "x-dev-user-email": "admin@packetfusion.com" } })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = doc.name;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => showToast("Download failed", "error"));
  }

  // Group documents by category for display
  const grouped = DOCUMENT_CATEGORIES.reduce<Record<string, Document[]>>((acc, cat) => {
    const catDocs = documents.filter((d) => d.category === cat);
    if (catDocs.length > 0) acc[cat] = catDocs;
    return acc;
  }, {});
  const uncategorized = documents.filter((d) => !d.category || !DOCUMENT_CATEGORIES.includes(d.category as typeof DOCUMENT_CATEGORIES[number]));
  if (uncategorized.length > 0) grouped["Other"] = [...(grouped["Other"] ?? []), ...uncategorized];

  return (
    <div style={{ display: "grid", gap: 20 }}>

      {/* Upload form */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Upload Document</div>
        <form onSubmit={handleUpload} style={{ display: "grid", gap: 14 }}>
          {/* File picker */}
          <div
            style={{
              border: `2px dashed ${selectedFile ? "rgba(37,99,235,0.6)" : "rgba(255,255,255,0.15)"}`,
              borderRadius: 12,
              padding: "20px 16px",
              textAlign: "center",
              cursor: "pointer",
              background: selectedFile ? "rgba(37,99,235,0.06)" : "transparent",
              transition: "all 0.15s",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
            {selectedFile ? (
              <>
                <div style={{ color: "#eef3ff", fontWeight: 600 }}>{selectedFile.name}</div>
                <div style={{ color: "#9fb0d9", fontSize: 13 }}>{formatBytes(selectedFile.size)}</div>
              </>
            ) : (
              <div style={{ color: "#9fb0d9", fontSize: 14 }}>Click to select a file (max 50 MB)</div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>

          {/* Metadata fields */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <FormField label="Category">
              <select
                value={uploadForm.category}
                onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}
                style={inputStyle}
              >
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Phase (optional)">
              <select
                value={uploadForm.phase_id}
                onChange={(e) => setUploadForm({ ...uploadForm, phase_id: e.target.value, task_id: "" })}
                style={inputStyle}
              >
                <option value="">No phase</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Task (optional)">
              <select
                value={uploadForm.task_id}
                onChange={(e) => setUploadForm({ ...uploadForm, task_id: e.target.value })}
                style={inputStyle}
                disabled={filteredTasks.length === 0}
              >
                <option value="">No task</option>
                {filteredTasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </FormField>
          </div>

          <div>
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "10px 20px",
                fontWeight: 700,
                cursor: uploading || !selectedFile ? "default" : "pointer",
                opacity: uploading || !selectedFile ? 0.5 : 1,
                fontSize: 14,
              }}
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>

      {/* Document list */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Documents ({documents.length})</div>

        {documents.length === 0 ? (
          <div style={{ color: "#9fb0d9" }}>No documents uploaded yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 20 }}>
            {Object.entries(grouped).map(([cat, docs]) => (
              <div key={cat}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#9fb0d9", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  {cat}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {docs.map((doc) => {
                    const phase = phases.find((p) => p.id === doc.phase_id);
                    const task = tasks.find((t) => t.id === doc.task_id);
                    return (
                      <div
                        key={doc.id}
                        style={{
                          background: "#182247",
                          borderRadius: 12,
                          padding: "12px 14px",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div style={{ fontSize: 22, flexShrink: 0 }}>{fileIcon(doc.content_type)}</div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: "#eef3ff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {doc.name}
                          </div>
                          <div style={{ color: "#9fb0d9", fontSize: 12, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <span>{formatBytes(doc.size_bytes)}</span>
                            {phase && <span>📁 {phase.name}</span>}
                            {task && <span>✓ {task.title}</span>}
                            <span>↑ {doc.uploader_name ?? "Unknown"}</span>
                            <span>{doc.created_at.slice(0, 10)}</span>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                          <span style={categoryBadge(doc.category)}>{doc.category ?? "Other"}</span>
                          <button
                            onClick={() => handleDownload(doc)}
                            style={actionBtn}
                            title="Download"
                          >
                            ↓ Download
                          </button>
                          <button
                            onClick={() => handleDelete(doc)}
                            style={{ ...actionBtn, color: "#ff6363", borderColor: "rgba(255,99,99,0.3)" }}
                            title="Delete"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 12, color: "#9fb0d9", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const sectionCard: React.CSSProperties = {
  background: "#121935",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 18,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#eef3ff",
  marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#182247",
  color: "#eef3ff",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  boxSizing: "border-box",
};

const actionBtn: React.CSSProperties = {
  background: "transparent",
  color: "#8db4ff",
  border: "1px solid rgba(141,180,255,0.3)",
  borderRadius: 8,
  padding: "4px 10px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 12,
};
