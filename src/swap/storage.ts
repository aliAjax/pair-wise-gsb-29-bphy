import { seedState } from "./seed";
import type { Order, SwapState } from "./types";

// 保存层：只管读写 localStorage，不掺杂任何业务判断
const STORAGE_KEY = "hxwlfront-15-swap-desk";

/** 兼容早期存档：补齐后加的字段 */
function normalize(raw: Partial<SwapState>): SwapState {
  const seeded = seedState();
  const orders: Order[] = Array.isArray(raw.orders)
    ? raw.orders.map((o) => ({
        ...o,
        consumedKwh: o.consumedKwh ?? 0,
        remainingBeforeKwh: o.remainingBeforeKwh ?? 0
      }))
    : seeded.orders;
  return {
    version: 1,
    shifts: raw.shifts ?? seeded.shifts,
    vehicles: raw.vehicles ?? seeded.vehicles,
    cabinets: raw.cabinets ?? seeded.cabinets,
    orders,
    logs: raw.logs ?? []
  };
}

export function loadState(): SwapState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedState();
  try {
    return normalize(JSON.parse(raw) as Partial<SwapState>);
  } catch {
    return seedState();
  }
}

export function saveState(state: SwapState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
