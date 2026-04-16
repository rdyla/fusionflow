export interface SupportUser {
  email: string;
  name: string | null;
  isInternal: boolean;
  contactId: string | null;
  accountId: string | null;
}

export interface SupportCase {
  id: string;
  ticketNumber: string;
  title: string;
  priority: string;
  status: string;
  state: string;
  createdOn: string;
  owner: string | null;
  accountName: string | null;
}

export interface SupportNote {
  id: string;
  subject: string | null;
  text: string | null;
  isAttachment: boolean;
  filename: string | null;
  mimetype: string | null;
  filesize: number | null;
  createdOn: string;
  createdBy: string;
}

export interface SupportCaseDetail extends SupportCase {
  description: string;
  statecode: number;
  statuscode: number;
  accountId: string | null;
  ownerId: string | null;
  primaryContactId: string | null;
  primaryContactName: string | null;
  notificationContactId: string | null;
  notificationContactName: string | null;
  escalationEngineerId: string | null;
  escalationEngineerName: string | null;
  notes: SupportNote[];
}

export interface AccountResult {
  id: string;
  name: string;
}

export interface ContactResult {
  id: string;
  name: string;
  email: string;
}

export interface UserResult {
  id: string;
  name: string;
  email: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const supportApi = {
  me: () => request<SupportUser>("/api/support/me"),

  getCases: (search?: string, mine?: boolean) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (mine) params.set("mine", "true");
    const qs = params.toString();
    return request<SupportCase[]>(`/api/support/cases${qs ? `?${qs}` : ""}`);
  },

  getCase: (id: string) => request<SupportCaseDetail>(`/api/support/cases/${id}`),

  createCase: (data: { title: string; description: string; prioritycode: number; accountId?: string; primaryContactId?: string; notificationContactId?: string; escalationEngineerId?: string }) =>
    request<{ id: string; ticketNumber: string }>("/api/support/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  addNote: (caseId: string, text: string) =>
    request("/api/support/cases/" + caseId + "/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),

  addAttachment: (caseId: string, data: { filename: string; mimetype: string; documentbody: string; notetext?: string }) =>
    request("/api/support/cases/" + caseId + "/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  updateStatus: (caseId: string, action: string, comment?: string) =>
    request("/api/support/cases/" + caseId + "/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, comment }),
    }),

  updateCaseContacts: (caseId: string, data: { primaryContactId?: string | null; notificationContactId?: string | null; escalationEngineerId?: string | null; ownerId?: string | null }) =>
    request("/api/support/cases/" + caseId + "/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getAttachmentUrl: (caseId: string, annotId: string) =>
    `/api/support/cases/${caseId}/attachments/${annotId}/download`,

  getMyContacts: () => request<ContactResult[]>("/api/support/me/contacts"),
};

export const supportAccounts = {
  search: (q: string) => request<AccountResult[]>(`/api/support/accounts?search=${encodeURIComponent(q)}`),
  getContacts: (accountId: string) => request<ContactResult[]>(`/api/support/accounts/${accountId}/contacts`),
};

export const supportUsers = {
  search: (q: string) => request<UserResult[]>(`/api/support/users?search=${encodeURIComponent(q)}`),
};

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function formatSupportDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
