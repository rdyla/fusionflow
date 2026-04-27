import type { CsProposal, CsProposalDetail, OppFormData, OppCalcResult } from "./calcSupport";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export type CsCustomerRef = {
  customerId?: string | null;
  customerName?: string | null;
};

export const csApi = {
  list: () => request<CsProposal[]>("/api/cloudsupport"),

  create: (name: string, customer?: CsCustomerRef) =>
    request<CsProposal>("/api/cloudsupport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...(customer ?? {}) }),
    }),

  get: (id: string) => request<CsProposalDetail>(`/api/cloudsupport/${id}`),

  rename: (id: string, name: string) =>
    request<{ ok: boolean }>(`/api/cloudsupport/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  setCustomer: (id: string, customer: CsCustomerRef) =>
    request<{ ok: boolean }>(`/api/cloudsupport/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customer),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/api/cloudsupport/${id}`, { method: "DELETE" }),

  saveVersion: (id: string, formData: OppFormData, calcResult: OppCalcResult, label?: string) =>
    request<{ id: string; versionNum: number; savedAt: string }>(`/api/cloudsupport/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formData, calcResult, label }),
    }),
};
