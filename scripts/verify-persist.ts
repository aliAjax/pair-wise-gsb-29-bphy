import { createPinia, setActivePinia } from "pinia";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0
} as Storage;
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID: () => `id-${Math.random().toString(36).slice(2)}` }
});

const { useSwapStore } = await import("../src/swap/store");
const { loadState } = await import("../src/swap/storage");

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.error(`✗ ${name} ${extra}`); }
};

setActivePinia(createPinia());
const store = useSwapStore();

// 派一个会被拦的单（温区不符）+ 一个换电成功的单
const coldOrder = store.orders.find((o) => o.id === "o-003")!; // 冷冻单
store.dispatch(coldOrder.id, "v-001", "", -1); // v-001 是常温车
check("温区不符被拦", coldOrder.status === "待处理" && coldOrder.reason.includes("温区不符"), coldOrder.reason);

const order = store.orders.find((o) => o.id === "o-002")!;
store.dispatch(order.id, "v-002", "c-lujiazui", 0);
check("换电单已排程", order.status === "已派单" && order.charged);

// 模拟重开页面：直接走 loadState
const reloaded = loadState();
const rCold = reloaded.orders.find((o) => o.id === "o-003")!;
const rOrder = reloaded.orders.find((o) => o.id === "o-002")!;
check("重开后仍见拦截原因", rCold.status === "待处理" && rCold.reason.includes("温区不符"));
check("重开后仍见换电排程", rOrder.status === "已派单" && rOrder.cabinetId === "c-lujiazui" && rOrder.slotStart === "10:00");
check("重开后日志还在", reloaded.logs.length >= 2);

// 旧存档（缺新字段）能被 normalize
mem.set(
  "hxwlfront-15-swap-desk",
  JSON.stringify({
    version: 1,
    shifts: [],
    vehicles: [],
    cabinets: [],
    orders: [{ id: "legacy", status: "待处理", reason: "" }],
    logs: []
  })
);
const legacy = loadState();
check("旧存档订单补齐新字段", (legacy.orders[0] as { consumedKwh: number }).consumedKwh === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
