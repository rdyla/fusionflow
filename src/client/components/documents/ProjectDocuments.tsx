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

// Category badge colors — light-theme tints
const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  "LOA":        { bg: "#dce9f8", color: "#0078d4" },
  "Cut Sheet":  { bg: "#f0ebfa", color: "#8764b8" },
  "CSR":        { bg: "#dff6dd", color: "#107c10" },
  "Contract":   { bg: "#fff4ce", color: "#835b00" },
  "Design Doc": { bg: "#fff4ce", color: "#835b00" },
  "Test Plan":  { bg: "#dce9f8", color: "#0078d4" },
  "Other":      { bg: "#f3f2f1", color: "#605e5c" },
};

export default function ProjectDocuments({ projectId, documents, phases, tasks, onDocumentsChange }: Props) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({ category: "Other", phase_id: "", task_id: "" });

  const filteredTasks = uploadForm.phase_id
    ? tasks.filter((t) => t.phase_id === uploadForm.phase_id)
    : tasks;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null);
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
    fetch(url, { headers: { "x-dev-user-email": "admin@packetfusion.com" } })
      .then((res) => { if (!res.ok) throw new Error("Download failed"); return res.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = doc.name;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => showToast("Download failed", "error"));
  }

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
      <div className="ms-section-card">
        <div className="ms-section-title">Upload Document</div>
        <form onSubmit={handleUpload} style={{ display: "grid", gap: 14 }}>
          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${selectedFile ? "#0078d4" : "#c8c6c4"}`,
              borderRadius: 4,
              padding: "20px 16px",
              textAlign: "center",
              cursor: "pointer",
              background: selectedFile ? "#dce9f8" : "#faf9f8",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
            {selectedFile ? (
              <>
                <div style={{ color: "#0078d4", fontWeight: 600 }}>{selectedFile.name}</div>
                <div style={{ color: "#605e5c", fontSize: 13 }}>{formatBytes(selectedFile.size)}</div>
              </>
            ) : (
              <div style={{ color: "#605e5c", fontSize: 14 }}>Click to select a file (max 50 MB)</div>
            )}
            <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFileChange} />
          </div>

          {/* Metadata fields */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label className="ms-label">
              <span>Category</span>
              <select className="ms-input" value={uploadForm.category} onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}>
                {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="ms-label">
              <span>Phase (optional)</span>
              <select className="ms-input" value={uploadForm.phase_id} onChange={(e) => setUploadForm({ ...uploadForm, phase_id: e.target.value, task_id: "" })}>
                <option value="">No phase</option>
                {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="ms-label">
              <span>Task (optional)</span>
              <select className="ms-input" value={uploadForm.task_id} onChange={(e) => setUploadForm({ ...uploadForm, task_id: e.target.value })} disabled={filteredTasks.length === 0}>
                <option value="">No task</option>
                {filteredTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
          </div>

          <div>
            <button type="submit" className="ms-btn-primary" disabled={uploading || !selectedFile}>
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>

      {/* Document list */}
      <div className="ms-section-card">
        <div className="ms-section-title">Documents ({documents.length})</div>

        {documents.length === 0 ? (
          <div style={{ color: "#a19f9d", fontSize: 14 }}>No documents uploaded yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 20 }}>
            {Object.entries(grouped).map(([cat, docs]) => {
              const catColors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["Other"];
              return (
                <div key={cat}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#605e5c", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                    {cat}
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {docs.map((doc) => {
                      const phase = phases.find((p) => p.id === doc.phase_id);
                      const task = tasks.find((t) => t.id === doc.task_id);
                      return (
                        <div key={doc.id} className="ms-row-item">
                          <div style={{ fontSize: 22, flexShrink: 0 }}>{fileIcon(doc.content_type)}</div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: "#323130", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {doc.name}
                            </div>
                            <div style={{ color: "#605e5c", fontSize: 12, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <span>{formatBytes(doc.size_bytes)}</span>
                              {phase && <span>· {phase.name}</span>}
                              {task && <span>· {task.title}</span>}
                              <span>· {doc.uploader_name ?? "Unknown"}</span>
                              <span>· {doc.created_at.slice(0, 10)}</span>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                            <span
                              className="ms-badge"
                              style={{ background: catColors.bg, color: catColors.color, border: `1px solid ${catColors.color}30` }}
                            >
                              {doc.category ?? "Other"}
                            </span>
                            <button className="ms-btn-ghost" onClick={() => handleDownload(doc)} title="Download">
                              ↓ Download
                            </button>
                            <button
                              className="ms-btn-ghost"
                              onClick={() => handleDelete(doc)}
                              style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
