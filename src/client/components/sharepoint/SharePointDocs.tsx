import { useEffect, useRef, useState } from "react";
import { api, type SPFile, type SPLocation, type SPFileEvent } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

/** Which record owns this SharePoint area — a project or a solution. Drives
 *  the retrofit endpoint and which id is stamped on folder-visibility rows.
 *  Both sides share the same folder-create + per-folder visibility control. */
type SharePointOwner = { kind: "project" | "solution"; id: string };

type Props = {
  recordId: string;
  sharepointUrl?: string | null;
  /** When set, this URL is used as the root of the file browser, bypassing
   *  the CRM-document-location lookup entirely. Set by the project/solution
   *  detail page to scope the SharePoint tab to that record's own subfolder
   *  under the customer's SP root. */
  folderUrl?: string | null;
  /** The owning project/solution. When provided alongside a null folderUrl,
   *  the component shows a "Create {owner} folder" button that calls the
   *  retrofit endpoint to create the folder under the customer's SP root. */
  owner?: SharePointOwner;
  /** Gates the folder-create button + per-folder visibility toggle to editors. */
  canEdit?: boolean;
  /** External roles (client / partner_ae) authenticate to native SharePoint
   *  URLs with their own Microsoft identity, which Entra rejects unless they're
   *  a guest in the Packet Fusion tenant. When true, the browser never links to
   *  SharePoint Online: file names use the pre-authenticated download URL and
   *  the "Open SharePoint" shortcut is suppressed, so everything stays inside
   *  the app's app-only access model. */
  isExternal?: boolean;
  /** Called when the retrofit endpoint successfully creates/adopts a folder
   *  — parent should refresh the record so the URL is persisted on subsequent
   *  renders without another retrofit call. */
  onFolderCreated?: (url: string) => void;
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

/** Recency key for a file — most recent activity wins, whether that's an
 *  upload or a later modification. Null-dated items sort to the bottom. */
function recencyKey(f: SPFile): number {
  const iso = f.lastModified ?? f.createdAt;
  return iso ? Date.parse(iso) : 0;
}

/** Sort newest-first so the freshest documents sit at the top of the list. */
function sortByRecency(files: SPFile[]): SPFile[] {
  return [...files].sort((a, b) => recencyKey(b) - recencyKey(a));
}

export default function SharePointDocs({ recordId, sharepointUrl, folderUrl, owner, canEdit, isExternal, onFolderCreated }: Props) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ownerNoun = owner?.kind === "solution" ? "solution" : "project";

  const [locations, setLocations] = useState<SPLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<SPLocation | null>(null);
  const [folderStack, setFolderStack] = useState<{ name: string; url: string }[]>([]);
  const [files, setFiles] = useState<SPFile[]>([]);

  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
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
    if (folderUrl) {
      // Owner-folder mode — synthesize a single location entry so the rest
      // of the component (breadcrumbs, file ops) works unchanged.
      const loc: SPLocation = { id: "__owner__", name: `${ownerNoun === "solution" ? "Solution" : "Project"} folder`, absoluteUrl: folderUrl };
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
  }, [recordId, folderUrl]);

  async function handleCreateOwnerFolder() {
    if (!owner) return;
    setCreatingFolder(true);
    try {
      const res = owner.kind === "solution"
        ? await api.ensureSolutionSharePointFolder(owner.id)
        : await api.ensureProjectSharePointFolder(owner.id);
      onFolderCreated?.(res.sharepoint_folder_url);
      showToast(res.reused ? `Adopted existing folder for this ${ownerNoun}.` : `${ownerNoun === "solution" ? "Solution" : "Project"} folder created.`, "success");
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
      .then(({ files: f }) => setFiles(sortByRecency(f)))
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
    setUploadPct(null);
    try {
      const { file: uploaded } = await api.spUpload(currentUrl, file, {
        description: uploadDescription || null,
        // Upload attribution is shadowed in sharepoint_uploads (project FK), so
        // it only applies to project folders; solution uploads fall back to the
        // Graph identity, same as the legacy customer-root behavior.
        projectId: owner?.kind === "project" ? owner.id : null,
        // Large files upload in chunks straight to SharePoint; show progress.
        onProgress: (pct) => setUploadPct(pct),
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
      setUploadPct(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /** Replace a file in place with a newly-picked file ("upload new version").
   *  The picked bytes upload under the TARGET file's name so SharePoint replaces
   *  the same item (new native version) instead of creating a second file; the
   *  replace + real user are logged server-side. Description is left untouched. */
  async function handleUploadNewVersion(target: SPFile, picked: File) {
    if (folderStack.length === 0) return;
    const currentUrl = folderStack[folderStack.length - 1].url;
    const bytes = picked.name === target.name
      ? picked
      : new File([picked], target.name, { type: picked.type || target.mimeType || "application/octet-stream" });
    setUploading(true);
    setUploadPct(null);
    try {
      await api.spUpload(currentUrl, bytes, {
        projectId: owner?.kind === "project" ? owner.id : null,
        onProgress: (pct) => setUploadPct(pct),
      });
      showToast(`New version of "${target.name}" uploaded.`, "success");
      loadFiles(currentUrl); // refresh attribution + modified date
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      setUploadPct(null);
    }
  }

  // ── Create folder ─────────────────────────────────────────────────────────

  async function handleCreateFolder() {
    const currentUrl = folderStack.length > 0 ? folderStack[folderStack.length - 1].url : null;
    if (!currentUrl) return;
    const name = window.prompt("New folder name:");
    if (!name || !name.trim()) return;
    setCreatingFolder(true);
    try {
      // New folders are hidden from client/partner by default (no visibility
      // row), so no owner id needs to be threaded into the create itself.
      await api.spCreateFolder(currentUrl, name.trim());
      showToast(`Folder "${name.trim()}" created.`, "success");
      loadFiles(currentUrl);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create folder", "error");
    } finally {
      setCreatingFolder(false);
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

        {/* Retrofit path: this record doesn't have its own folder yet. Show a
            one-click button to create + adopt one. Only relevant when an owner
            (project/solution) is set + editor. */}
        {owner && canEdit && !folderUrl && (
          <div style={{ marginBottom: sharepointUrl ? 16 : 0 }}>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>
              This {ownerNoun} doesn't have a SharePoint folder yet. Create one under the customer's SharePoint root — it becomes the upload location for discovery workbooks, customer phone bills, CSRs, and any other {ownerNoun} documents.
            </div>
            <button
              className="ms-btn-primary"
              onClick={handleCreateOwnerFolder}
              disabled={creatingFolder}
            >
              {creatingFolder ? "Creating…" : `Create ${ownerNoun} folder`}
            </button>
          </div>
        )}

        {isExternal ? (
          /* External roles can't open SharePoint Online directly (Entra rejects
             non-guest accounts). Don't expose the native link — documents are
             surfaced in-app once a portal folder is shared. */
          <div style={{ color: "#a19f9d", fontSize: 14 }}>
            No documents have been shared in the portal for this {ownerNoun} yet. Your Packet Fusion contact can share them here.
          </div>
        ) : sharepointUrl ? (
          <div>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
              {owner && canEdit ? "Or open the customer's SharePoint root directly:" : "No document library linked in Dynamics CRM for this record. Use the SharePoint link directly:"}
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
        ) : !(owner && canEdit) ? (
          <div style={{ color: "#a19f9d", fontSize: 14 }}>
            No SharePoint document locations linked to this record in Dynamics CRM.
          </div>
        ) : null}
      </div>
    );
  }

  const currentUrl = folderStack.length > 0 ? folderStack[folderStack.length - 1].url : null;
  const showCreateOwnerFolderPrompt = !!owner && !!canEdit && !folderUrl;

  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* Owner-folder upgrade prompt — visible whenever the record doesn't
          have its own folder yet, regardless of whether CRM has document
          locations linked. Most records DO have CRM locations, so the
          fallback render below never fires and this is the only place the
          user gets a chance to opt in. */}
      {showCreateOwnerFolderPrompt && (
        <div className="ms-section-card" style={{ background: "#fefce8", borderColor: "#fde68a" }}>
          <div style={{ fontSize: 13, color: "#854d0e", marginBottom: 8 }}>
            <strong>This {ownerNoun} doesn't have its own SharePoint folder.</strong> Files below are coming from the customer's shared CRM-linked location. Create a dedicated {ownerNoun} folder under the customer's SharePoint root — that's where discovery workbooks, customer phone bills, CSRs, and {ownerNoun} documents should land.
          </div>
          <button
            className="ms-btn-primary"
            onClick={handleCreateOwnerFolder}
            disabled={creatingFolder}
            style={{ fontSize: 13 }}
          >
            {creatingFolder ? "Creating…" : `Create ${ownerNoun} folder`}
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
              {uploading ? (uploadPct != null ? `Uploading… ${uploadPct}%` : "Uploading…") : "↑ Upload File"}
            </button>
            {canEdit && (
              <button
                className="ms-btn-ghost"
                onClick={handleCreateFolder}
                disabled={creatingFolder || !currentUrl}
                style={{ fontSize: 13 }}
              >
                {creatingFolder ? "Creating…" : "+ New Folder"}
              </button>
            )}
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
                  canEdit={!!canEdit}
                  isExternal={!!isExternal}
                  owner={owner ?? null}
                  isDeleting={deletingId === file.id}
                  onNavigateInto={() => navigateInto(file)}
                  onDelete={() => handleDelete(file)}
                  onUploadNewVersion={(picked) => handleUploadNewVersion(file, picked)}
                  onDescriptionSaved={(updated) =>
                    setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
                  }
                  onVisibilityChanged={(visible) =>
                    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, visibleToClient: visible } : f)))
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
  canEdit,
  isExternal,
  owner,
  isDeleting,
  onNavigateInto,
  onDelete,
  onUploadNewVersion,
  onDescriptionSaved,
  onVisibilityChanged,
}: {
  file: SPFile;
  canEdit: boolean;
  isExternal: boolean;
  owner: SharePointOwner | null;
  isDeleting: boolean;
  onNavigateInto: () => void;
  onDelete: () => void;
  onUploadNewVersion: (picked: File) => Promise<void>;
  onDescriptionSaved: (updated: SPFile) => void;
  onVisibilityChanged: (visible: boolean) => void;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.description ?? "");
  const [saving, setSaving] = useState(false);
  const [togglingVis, setTogglingVis] = useState(false);
  const versionInputRef = useRef<HTMLInputElement>(null);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<SPFileEvent[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function pickNewVersion(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setUploadingVersion(true);
    try {
      await onUploadNewVersion(picked);
      // A replace bumps the timeline — drop the cache so a reopen refetches.
      setHistory(null);
    } finally {
      setUploadingVersion(false);
      if (versionInputRef.current) versionInputRef.current.value = "";
    }
  }

  async function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && history === null) {
      setLoadingHistory(true);
      try {
        const { events } = await api.spFileHistory(file.id);
        setHistory(events);
      } catch {
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    }
  }

  async function toggleVisibility() {
    const next = !file.visibleToClient;
    setTogglingVis(true);
    try {
      await api.spSetFolderVisibility({
        sp_item_id: file.id,
        web_url: file.webUrl,
        project_id: owner?.kind === "project" ? owner.id : null,
        solution_id: owner?.kind === "solution" ? owner.id : null,
        visible: next,
      });
      onVisibilityChanged(next);
      showToast(next ? "Folder shared with client/partner." : "Folder hidden from client/partner.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update visibility", "error");
    } finally {
      setTogglingVis(false);
    }
  }

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
        ) : isExternal ? (
          /* External roles can't open the native SharePoint URL (Entra rejects
             non-guest accounts). Use the pre-authenticated download URL so the
             file opens/downloads without a Packet Fusion tenant sign-in. Fall
             back to plain text on the rare file with no download URL. */
          file.downloadUrl ? (
            <a
              href={file.downloadUrl}
              download={file.name}
              style={{ color: "#1e293b", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
            >
              {file.name}
            </a>
          ) : (
            <span style={{ color: "#1e293b", fontWeight: 600, fontSize: 14 }}>{file.name}</span>
          )
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

        {/* Version history timeline — who uploaded/replaced this file, when.
            Visible to anyone who can see the file. */}
        {historyOpen && !file.isFolder && (
          <div style={{ marginTop: 8, borderTop: "1px solid #eef2f7", paddingTop: 8 }}>
            {loadingHistory ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Loading history…</div>
            ) : !history || history.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>No recorded history for this file.</div>
            ) : (
              <div style={{ display: "grid", gap: 4 }}>
                {history.map((ev) => (
                  <div key={ev.id} style={{ fontSize: 12, color: "#475569", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, color: ev.action === "replace" ? "#b45309" : "#0b9aad", minWidth: 62 }}>
                      {ev.action === "replace" ? "Replaced" : "Uploaded"}
                    </span>
                    <span>{formatDate(ev.created_at)}</span>
                    {ev.actor_name && <span style={{ color: "#64748b" }}>by {ev.actor_name}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        {file.isFolder && canEdit && owner && (
          <button
            className="ms-btn-ghost"
            onClick={toggleVisibility}
            disabled={togglingVis}
            title={file.visibleToClient
              ? "Visible to client/partner — click to make internal-only"
              : "Internal-only — click to share with client/partner"}
            style={{
              fontSize: 12,
              color: file.visibleToClient ? "#107c10" : "#64748b",
              borderColor: file.visibleToClient ? "rgba(16,124,16,0.35)" : "#cbd5e1",
            }}
          >
            {togglingVis ? "…" : file.visibleToClient ? "👁 Visible to client" : "🔒 Internal only"}
          </button>
        )}
        {!file.isFolder && (
          <button
            className="ms-btn-ghost"
            onClick={toggleHistory}
            style={{ fontSize: 12 }}
            title="Show this file's upload / replace history"
          >
            {historyOpen ? "History ▲" : "History ▾"}
          </button>
        )}
        {!file.isFolder && canEdit && !isExternal && (
          <>
            <input ref={versionInputRef} type="file" style={{ display: "none" }} onChange={pickNewVersion} />
            <button
              className="ms-btn-ghost"
              onClick={() => versionInputRef.current?.click()}
              disabled={uploadingVersion}
              style={{ fontSize: 12 }}
              title="Replace this file with a new version (keeps the same file + logs who/when)"
            >
              {uploadingVersion ? "Uploading…" : "↑ New version"}
            </button>
          </>
        )}
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
