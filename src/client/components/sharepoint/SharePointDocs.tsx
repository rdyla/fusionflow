import { useEffect, useRef, useState } from "react";
import { api, type SPFile, type SPLocation } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

type Props = {
  recordId: string;
  sharepointUrl?: string | null;
};

const MIME_ICONS: Record<string, string> = {
  "application/pdf": "📄",
  "application/vnd.ms-excel": "📊",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
  "application/msword": "📝",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
  "application/vnd.ms-powerpoint": "📋",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "📋",
  "text/plain": "📃",
  "text/csv": "📊",
  "image/png": "🖼️",
  "image/jpeg": "🖼️",
  "image/gif": "🖼️",
  "image/webp": "🖼️",
};

function fileIcon(mimeType: string | null, isFolder: boolean) {
  if (isFolder) return "📁";
  if (!mimeType) return "📎";
  return MIME_ICONS[mimeType] ?? "📎";
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export default function SharePointDocs({ recordId, sharepointUrl }: Props) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [locations, setLocations] = useState<SPLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<SPLocation | null>(null);
  const [folderStack, setFolderStack] = useState<{ name: string; url: string }[]>([]);
  const [files, setFiles] = useState<SPFile[]>([]);

  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [locError, setLocError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);

  // ── Load locations ──────────────────────────────────────────────────────────

  useEffect(() => {
    setLoadingLocations(true);
    setLocError(null);
    api.spLocations(recordId)
      .then(({ locations: locs }) => {
        setLocations(locs);
        if (locs.length === 1) selectLocation(locs[0]);
      })
      .catch((err) => setLocError(err instanceof Error ? err.message : "Failed to load SharePoint locations"))
      .finally(() => setLoadingLocations(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  // ── Load files for current folder ──────────────────────────────────────────

  function loadFiles(folderUrl: string) {
    setLoadingFiles(true);
    setFilesError(null);
    api.spFiles(folderUrl)
      .then(({ files: f }) => setFiles(f))
      .catch((err) => setFilesError(err instanceof Error ? err.message : "Failed to load files"))
      .finally(() => setLoadingFiles(false));
  }

  function selectLocation(loc: SPLocation) {
    setSelectedLocation(loc);
    setFolderStack([{ name: loc.name, url: loc.absoluteUrl }]);
    loadFiles(loc.absoluteUrl);
  }

  function navigateInto(folder: SPFile) {
    const newStack = [...folderStack, { name: folder.name, url: folder.webUrl }];
    setFolderStack(newStack);
    loadFiles(folder.webUrl);
  }

  function navigateTo(index: number) {
    const newStack = folderStack.slice(0, index + 1);
    setFolderStack(newStack);
    loadFiles(newStack[newStack.length - 1].url);
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || folderStack.length === 0) return;
    const currentUrl = folderStack[folderStack.length - 1].url;
    setUploading(true);
    try {
      const { file: uploaded } = await api.spUpload(currentUrl, file);
      setFiles((prev) => {
        const without = prev.filter((f) => f.name !== uploaded.name);
        return [uploaded, ...without];
      });
      showToast(`"${uploaded.name}" uploaded to SharePoint.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete(file: SPFile) {
    if (!window.confirm(`Delete "${file.name}" from SharePoint?`)) return;
    setDeletingId(file.id);
    try {
      await api.spDelete(file.webUrl);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      showToast(`"${file.name}" deleted.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadingLocations) {
    return (
      <div className="ms-section-card">
        <div style={{ color: "#a19f9d", fontSize: 14 }}>Loading SharePoint locations…</div>
      </div>
    );
  }

  if (locError || locations.length === 0) {
    return (
      <div className="ms-section-card">
        <div className="ms-section-title">SharePoint Documents</div>
        {sharepointUrl ? (
          <div>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
              No document library linked in Dynamics CRM for this record. Use the SharePoint link directly:
            </div>
            <a
              href={sharepointUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#0b9aad", textDecoration: "none", fontWeight: 600, background: "rgba(11,154,173,0.06)", border: "1px solid rgba(11,154,173,0.2)", borderRadius: 6, padding: "8px 14px" }}
            >
              Open SharePoint ↗
            </a>
          </div>
        ) : (
          <div style={{ color: "#a19f9d", fontSize: 14 }}>
            No SharePoint document locations linked to this record in Dynamics CRM.
          </div>
        )}
      </div>
    );
  }

  const currentUrl = folderStack.length > 0 ? folderStack[folderStack.length - 1].url : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* Location selector — only shown when there are multiple */}
      {locations.length > 1 && (
        <div className="ms-section-card">
          <div className="ms-section-title">Document Library</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {locations.map((loc) => (
              <button
                key={loc.id}
                className={selectedLocation?.id === loc.id ? "ms-btn-primary" : "ms-btn-ghost"}
                onClick={() => selectLocation(loc)}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* File browser */}
      {selectedLocation && (
        <div className="ms-section-card">
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {folderStack.map((crumb, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <span style={{ color: "#94a3b8" }}>/</span>}
                {i < folderStack.length - 1 ? (
                  <button
                    className="ms-btn-ghost"
                    onClick={() => navigateTo(i)}
                    style={{ padding: "2px 6px", fontSize: 13 }}
                  >
                    {crumb.name}
                  </button>
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{crumb.name}</span>
                )}
              </span>
            ))}
          </div>

          {/* Upload */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={handleUpload}
            />
            <button
              className="ms-btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !currentUrl}
            >
              {uploading ? "Uploading…" : "↑ Upload File"}
            </button>
            <button
              className="ms-btn-ghost"
              onClick={() => currentUrl && loadFiles(currentUrl)}
              disabled={loadingFiles}
              style={{ fontSize: 13 }}
            >
              {loadingFiles ? "Loading…" : "↻ Refresh"}
            </button>
          </div>

          {/* Error */}
          {filesError && (
            <div style={{ color: "#d13438", fontSize: 14, marginBottom: 12 }}>Error: {filesError}</div>
          )}

          {/* File list */}
          {!loadingFiles && files.length === 0 && !filesError && (
            <div style={{ color: "#a19f9d", fontSize: 14 }}>No files in this folder.</div>
          )}

          {files.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {files.map((file) => (
                <div key={file.id} className="ms-row-item">
                  <div style={{ fontSize: 22, flexShrink: 0 }}>{fileIcon(file.mimeType, file.isFolder)}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {file.isFolder ? (
                      <button
                        style={{
                          background: "none", border: "none", padding: 0, cursor: "pointer",
                          color: "#63c1ea", fontWeight: 600, fontSize: 14, textAlign: "left",
                        }}
                        onClick={() => navigateInto(file)}
                      >
                        {file.name}
                      </button>
                    ) : (
                      <a
                        href={file.webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#1e293b", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
                      >
                        {file.name}
                      </a>
                    )}
                    <div style={{ color: "#64748b", fontSize: 12, marginTop: 2, display: "flex", gap: 10 }}>
                      {!file.isFolder && <span>{formatBytes(file.size)}</span>}
                      <span>Modified {formatDate(file.lastModified)}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    {!file.isFolder && file.downloadUrl && (
                      <a
                        href={file.downloadUrl}
                        download={file.name}
                        className="ms-btn-ghost"
                        style={{ textDecoration: "none" }}
                      >
                        ↓ Download
                      </a>
                    )}
                    {!file.isFolder && (
                      <button
                        className="ms-btn-ghost"
                        onClick={() => handleDelete(file)}
                        disabled={deletingId === file.id}
                        style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}
                      >
                        {deletingId === file.id ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
