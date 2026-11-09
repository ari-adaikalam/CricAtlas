/**
 * Whether this device can spend memory, processor time and data on work the user has not asked for yet (warming the query engine, prefetching). A device is "light" when it reports 4 GB of
 * memory or less, a slow connection type, or the data saver setting. Safari reports none of these, so an unknown device counts as light on a phone-sized screen
 * and as full on a desktop.
 */
export type Capability = 'full' | 'light';

export interface DeviceFacts {
  /** navigator.deviceMemory, in GB (Chromium only, rounded down to a power of two, capped at 8). */
  memoryGb?: number | undefined;
  /** navigator.connection.effectiveType. */
  connection?: string | undefined;
  /** navigator.connection.saveData. */
  saveData?: boolean | undefined;
  /** The window's width in CSS pixels. */
  width: number;
}

const SLOW = new Set(['slow-2g', '2g', '3g']);
const PHONE_WIDTH = 820;

export function capabilityOf(facts: DeviceFacts): Capability {
  if (facts.saveData) return 'light';
  if (facts.connection !== undefined && SLOW.has(facts.connection)) return 'light';
  if (facts.memoryGb !== undefined) return facts.memoryGb <= 4 ? 'light' : 'full';
  return facts.width <= PHONE_WIDTH ? 'light' : 'full';
}

/** The capability of the browser this runs in. On the server, and when nothing is known, a desktop is assumed. */
export function deviceCapability(): Capability {
  if (typeof window === 'undefined') return 'full';
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; saveData?: boolean } };
  return capabilityOf({ memoryGb: nav.deviceMemory, connection: nav.connection?.effectiveType, saveData: nav.connection?.saveData, width: window.innerWidth });
}
