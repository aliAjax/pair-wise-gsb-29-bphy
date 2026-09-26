import type { State } from "./data";

const STORAGE_KEY = "hxwlfront-15-swap-scheduler";

/** 读取本地排程；没有存档时返回 null，由调用方决定用种子数据 */
export function loadState(): State | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as State;
    if (!Array.isArray(parsed.vehicles) || !Array.isArray(parsed.cabinets) || !Array.isArray(parsed.orders)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: State): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
