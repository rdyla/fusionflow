import { useEffect, useRef, useState } from "react";
import { api, type SPFile, type SPLocation } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

type Props = {
  recordId: string;
  sharepointUrl?: string | null;
  /** When set, this URL is used as the root of the file browser, bypassing
   *  the CRM-document-location lookup entirely. Set by ProjectDetailPage
   *  to scope the SharePoint tab to the project's own subfolder under the
   *  customer's SP root. */
  projectFolderUrl?: string | null;
  /** When provided alongside a null projectFolderUrl, the component shows
   *  a "Create project folder" button that calls the retrofit endpoint to
   *  create the folder under the customer's SP root. */
  projectId?: string;
  /** Gates the "Create project folder" button to editors. */
  canEdit?: boolean;
  /** Called when the retrofit endpoint successfully creates/adopts a folder
   *  — parent should refresh the project so the URL is persisted on subsequent
   *  renders without another retrofit call. */
  onProjectFolderCreated?: (url: string) => void;
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

export default function SharePointDocs({ recordId, sharepointUrl, projectFolderUrl, projectId, canEdit, onProjectFolderCreated }: Props) {
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
  const [creatingFolder, setCreatingFolder] = useState(false);
  /** Optional description typed by the user before clicking Upload. Captured
   *  alongside the file so it lands on the SP driveItem as metadata. */
  const [uploadDescription, setUploadDescription] = useState("");

  const [locError, setLocError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  // Two modes:
  //   1. Project mode: a per-project folder URL is set → root the file browser
  //      there and skip the CRM-locations lookup entirely.
  //   2. Legacy/customer mode: pull document locations from CRM by recordId.

  useEffect(() => {
    if (projectFolderUrl) {
      // Project-folder mode — synthesize a single location entry so the rest
      // of the component (breadcrumbs, file ops) works unchanged.
      const loc: SPLocation = { id: "__project__", name: "Project folder", absoluteUrl: projectFolderUrl };
      setLocations([loc]);
      selectLocation(loc);
      setLoadingLocations(false);
      return;
    }
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
  }, [recordId, projectFolderUrl]);

  async function handleCreateProjectFolder() {
    if (!projectId) return;
    setCreatingFolder(true);
    try {
      const res = await api.ensureProjectSharePointFolder(projectId);
      onProjectFolderCreated?.(res.sharepoint_folder_url);
      showToast(res.reused ? "Adopted existing folder for this project." : "Project folder created.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create folder", "error");
    } finally {
      setCreatingFolder(false);
    }
  }

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
      const { file: uploaded } = await api.spUpload(currentUrl, file, {
        description: uploadDescription || null,
        projectId: projectId ?? null,
      });
      setFiles((prev) => {
        const without = prev.filter((f) => f.name !== uploaded.name);
        return [uploaded, ...without];
      });
      showToast(`"${uploaded.name}" uploaded to SharePoint.`, "success");
      setUploadDescription(""); // Clear after successful upload so next upload starts fresh
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

        {/* Retrofit path: this project doesn't have its own folder yet. Show a
            one-click button to create + adopt one. Only relevant in project
            context (projectId set + editor). */}
        {projectId && canEdit && !projectFolderUrl && (
          <div style={{ marginBottom: sharepointUrl ? 16 : 0 }}>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>
              This project doesn't have a SharePoint folder yet. Create one under the customer's SharePoint root — it becomes the upload location for discovery workbooks, customer phone bills, CSRs, and any other project documents.
            </div>
            <button
              className="ms-btn-primary"
              onClick={handleCreateProjectFolder}
              disabled={creatingFolder}
            >
              {creatingFolder ? "Creating…" : "Create project folder"}
            </button>
          </div>
        )}

        {sharepointUrl ? (
          <div>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
              {projectId && canEdit ? "Or open the customer's SharePoint root directly:" : "No document library linked in Dynamics CRM for this record. Use the SharePoint link directly:"}
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
        ) : !(projectId && canEdit) ? (
          <div style={{ color: "#a19f9d", fontSize: 14 }}>
            No SharePoint document locations linked to this record in Dynamics CRM.
          </div>
        ) : null}
      </div>
    );
  }

  const currentUrl = folderStack.length > 0 ? folderStack[folderStack.length - 1].url : null;
  const showCreateProjectFolderPrompt = !!projectId && !!canEdit && !projectFolderUrl;

  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* Project-folder upgrade prompt — visible whenever the project doesn't
          have its own folder yet, regardless of whether CRM has document
          locations linked. Most projects DO have CRM locations, so the
          fallback render below never fires and this is the only place the
          PM gets a chance to opt in. */}
      {showCreateProjectFolderPrompt && (
        <div className="ms-section-card" style={{ background: "#fefce8", borderColor: "#fde68a" }}>
          <div style={{ fontSize: 13, color: "#854d0e", marginBottom: 8 }}>
            <strong>This project doesn't have its own SharePoint folder.</strong> Files below are coming from the customer's shared CRM-linked location. Create a dedicated project folder under the customer's SharePoint root — that's where discovery workbooks, customer phone bills, CSRs, and project documents should land.
          </div>
          <button
            className="ms-btn-primary"
            onClick={handleCreateProjectFolder}
            disabled={creatingFolder}
            style={{ fontSize: 13 }}
          >
            {creatingFolder ? "Creating…" : "Create project folder"}
          </button>
        </div>
      )}

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
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={handleUpload}
            />
            {/* Description input — optional but encouraged. Travels with the
                file as SP driveItem.description so it's visible from the SP
                web UI too, not just here. */}
            <input
              type="text"
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="Description (optional) — e.g. 'phone bill March 2026'"
              disabled={uploading}
              style={{ flex: 1, minWidth: 240, fontSize: 13, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6 }}
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
                <FileRow
                  key={file.id}
                  file={file}
                  isDeleting={deletingId === file.id}
                  onNavigateInto={() => navigateInto(file)}
                  onDelete={() => handleDelete(file)}
                  onDescriptionSaved={(updated) =>
                    setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── File row with inline description edit ────────────────────────────────────

function FileRow({
  file,
  isDeleting,
  onNavigateInto,
  onDelete,
  onDescriptionSaved,
}: {
  file: SPFile;
  isDeleting: boolean;
  onNavigateInto: () => void;
  onDelete: () => void;
  onDescriptionSaved: (updated: SPFile) => void;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.description ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { file: updated } = await api.spUpdateDescription(file.webUrl, draft || null);
      onDescriptionSaved(updated);
      setEditing(false);
      showToast(draft.trim() ? "Description saved." : "Description cleared.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save description", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ms-row-item" style={{ alignItems: "flex-start" }}>
      <div style={{ fontSize: 22, flexShrink: 0, paddingTop: 2 }}>{fileIcon(file.mimeType, file.isFolder)}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {file.isFolder ? (
          <button
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              color: "#63c1ea", fontWeight: 600, fontSize: 14, textAlign: "left",
            }}
            onClick={onNavigateInto}
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

        {/* Description — clickable to edit (files only). Shows "Add description"
            placeholder when empty so PMs/customers know they can fill it in. */}
        {!file.isFolder && (
          editing ? (
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  else if (e.key === "Escape") { setEditing(false); setDraft(file.description ?? ""); }
                }}
                disabled={saving}
                placeholder="What is this file?"
                style={{ flex: 1, fontSize: 12, padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 4 }}
              />
              <button
                onClick={save}
                disabled={saving}
                style={{ background: "#03395f", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}
              >
                {saving ? "…" : "Save"}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(file.description ?? ""); }}
                disabled={saving}
                style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "#64748b" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => { setDraft(file.description ?? ""); setEditing(true); }}
                style={{
                  display: "block", background: "none", border: "none", padding: 0,
                  fontSize: 12, color: file.description ? "#475569" : "#94a3b8",
                  cursor: "pointer", textAlign: "left", fontStyle: file.description ? "normal" : "italic",
                  lineHeight: 1.4,
                }}
                title="Click to edit description"
              >
                {file.description || "+ Add description"}
              </button>
            </div>
          )
        )}

        <div style={{ color: "#64748b", fontSize: 11, marginTop: 4, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {!file.isFolder && file.size != null && <span>{formatBytes(file.size)}</span>}
          {file.createdAt && (
            <span>
              Uploaded {formatDate(file.createdAt)}
              {file.createdByName && ` by ${file.createdByName}`}
            </span>
          )}
          {file.lastModified && file.lastModified !== file.createdAt && (
            <span>
              Modified {formatDate(file.lastModified)}
              {file.modifiedByName && file.modifiedByName !== file.createdByName && ` by ${file.modifiedByName}`}
            </span>
          )}
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
            onClick={onDelete}
            disabled={isDeleting}
            style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}
