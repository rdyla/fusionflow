export interface SupportUser {
  email: string;
  name: string | null;
  isInternal: boolean;
  contactId: string | null;
  accountId: string | null;
}

// severitycode option-set values in D365 (Packet Fusion tenant)
export const SEVERITY = {
  P1: 1,
  P2: 173590000,
  P3: 173590001,
  E1: 100000000,
  E2: 100000001,
} as const;

export const CUSTOMER_SEVERITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: SEVERITY.P1, label: "P1" },
  { value: SEVERITY.P2, label: "P2" },
  { value: SEVERITY.P3, label: "P3" },
];

export const STAFF_SEVERITY_OPTIONS: Array<{ value: number; label: string }> = [
  ...CUSTOMER_SEVERITY_OPTIONS,
  { value: SEVERITY.E1, label: "E1" },
  { value: SEVERITY.E2, label: "E2" },
];

export function severityColor(label: string | null | undefined): string {
  switch (label) {
    case "P1":
    case "E1":
      return "#d13438";
    case "P2":
    case "E2":
      return "#ea580c";
    case "P3":
      return "#0891b2";
    default:
      return "#94a3b8";
  }
}

export interface SupportCase {
  id: string;
  ticketNumber: string;
  title: string;
  severity: string | null;
  status: string;
  state: string;
  createdOn: string;
  modifiedOn: string;
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
  modifiedOn: string;
  statecode: number;
  statuscode: number;
  severitycode: number | null;
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

export interface SupportDashboardStaleCase {
  id: string;
  ticketNumber: string;
  title: string;
  severity: string;
  status: string;
  owner: string | null;
  ageDays: number;
  createdOn: string;
}

export interface SupportDashboardResponse {
  windowDays: number;
  staleThresholdDays: number;
  kpis: {
    totalOpen: number;
    p1Open: number;
    unassigned: number;
    stale7d: number;
    stuckOnCustomer: number;
    resolvedLast30d: number;
    avgResolveDays: number | null;
  };
  severityDistribution: { label: string; count: number }[];
  statusDistribution:   { label: string; count: number }[];
  ownerDistribution:    { label: string; count: number }[];
  agingBuckets:         { label: string; count: number }[];
  staleOpen:            SupportDashboardStaleCase[];
  trend: {
    days: string[];
    opened: number[];
    resolved: number[];
  };
}

export const supportApi = {
  me: () => request<SupportUser>("/api/support/me"),

  getDashboard: () => request<SupportDashboardResponse>("/api/support/dashboard"),

  getCases: (search?: string, mine?: boolean) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (mine) params.set("mine", "true");
    const qs = params.toString();
    return request<SupportCase[]>(`/api/support/cases${qs ? `?${qs}` : ""}`);
  },

  getCase: (id: string) => request<SupportCaseDetail>(`/api/support/cases/${id}`),

  createCase: (data: { title: string; description: string; severitycode: number; accountId?: string; primaryContactId?: string; notificationContactId?: string; escalationEngineerId?: string }) =>
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

  getAccountLastVendor: (accountId: string) =>
    request<{ vendor: string | null; vendorId?: string | null; techType?: string | null; soldOn?: string | null }>(
      `/api/support/accounts/${accountId}/last-vendor`
    ),
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
