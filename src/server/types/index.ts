export type AppRole = "admin" | "pm" | "pf_ae" | "partner_ae";

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  organization_name: string | null;
  role: AppRole;
  is_active: number;
}

export interface AuthContext {
  user: AppUser;
  role: AppRole;
  organization: string | null;
}

export type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
};

export type Variables = {
  auth: AuthContext;
};