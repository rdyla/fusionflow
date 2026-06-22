/**
 * Demo-mode lens — vendor lock for partner demos.
 *
 * Lives in a single module-level store (not React Context) so any component
 * can read/refresh it without wrapping the tree. The AppShell calls
 * `bootstrapDemoMode()` on mount; the admin toggle calls `setDemoMode()`.
 *
 * The server applies the actual filtering. The client just needs to know the
 * value to constrain pickers and create-form vendor fields.
 */

import { useEffect, useState } from "react";
import { api } from "./api";

// "webex" is the underlying vendor value for the Cisco demo lens.
export type DemoVendor = "zoom" | "ringcentral" | "webex" | null;

let current: DemoVendor = null;
let loaded = false;
const listeners = new Set<(v: DemoVendor) => void>();

function emit() {
  for (const cb of listeners) cb(current);
}

export async function bootstrapDemoMode(): Promise<DemoVendor> {
  try {
    const { demoVendor } = await api.publicSettings();
    current = demoVendor;
  } catch {
    current = null;
  }
  loaded = true;
  emit();
  return current;
}

export function getDemoMode(): DemoVendor {
  return current;
}

export async function setDemoMode(vendor: DemoVendor): Promise<void> {
  await api.adminSetDemoMode(vendor);
  current = vendor;
  loaded = true;
  emit();
}

export function useDemoMode(): { demoVendor: DemoVendor; loaded: boolean } {
  const [v, setV] = useState<DemoVendor>(current);
  const [isLoaded, setIsLoaded] = useState(loaded);
  useEffect(() => {
    const cb = (next: DemoVendor) => { setV(next); setIsLoaded(true); };
    listeners.add(cb);
    if (!loaded) bootstrapDemoMode();
    return () => { listeners.delete(cb); };
  }, []);
  return { demoVendor: v, loaded: isLoaded };
}
