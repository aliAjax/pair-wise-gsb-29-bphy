import { createPinia, setActivePinia } from "pinia";
// Node 环境下给浏览器 API 打桩
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0
} as Storage;
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => `id-${Math.random().toString(36).slice(2)}` }
  });
}
const { useSwapStore } = await import("../src/swap/store");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`✓ ${name}`);
  } else {
    fail++;
    console.error(`✗ ${name} ${extra}`);
  }
}

setActivePinia(createPinia());
const store = useSwapStore();

// 用例：冷藏车 v-002（余电0.4度=5km）接 14km 冷藏单 o-002，约陆家嘴柜 10:00（绕路2km）
const order = store.orders.find((o) => o.id === "o-002")!;
const vehicle = store.vehicleById("v-002")!;
const cabinet = store.cabinets.find((c) => c.id === "c-lujiazui")!;

check("初始待处理", order.status === "待处理");
check("初始柜位余量1", store.slotRemainOf(cabinet.id, 0) === 1);
const beforeKwh = vehicle.remainingKwh;

const r1 = store.dispatch(order.id, "v-002", cabinet.id, 0);
check("换电派单成功", r1.ok, r1.message);
check("订单变已派单", order.status === "已派单");
check("记录换电预约", order.charged && order.cabinetId === cabinet.id);
check("派单后按满电跑14km：余电=2-14*0.08=0.88", Math.abs(vehicle.remainingKwh - 0.88) < 1e-9, String(vehicle.remainingKwh));
check("核算耗电含绕路：16*0.08=1.28", Math.abs(order.consumedKwh - 1.28) < 1e-9, String(order.consumedKwh));
check("柜位被占满", store.slotRemainOf(cabinet.id, 0) === 0);

// 第二单再约同时段 → 约满，留在待处理
const extra = store.addOrder({
  address: "测试冷链单",
  distanceKm: 12,
  windowStart: "10:00",
  windowEnd: "12:00",
  zone: "冷藏"
});
void extra;
const order2 = store.orders[0];
const r2 = store.dispatch(order2.id, "v-002", cabinet.id, 0);
check("约满派单被拦", !r2.ok && r2.message.includes("约满"), r2.message);
check("被拦单留在待处理并写原因", order2.status === "待处理" && order2.reason.includes("约满"));

// 取消早班 → 释放预约、退回待处理、余电恢复
store.toggleShift("shift-morning");
check("取消后订单退回待处理", order.status === "待处理", order.status);
check("取消后预约清空", order.cabinetId === "" && order.slotStart === "");
check("取消后车辆余电恢复派单前", Math.abs(vehicle.remainingKwh - beforeKwh) < 1e-9, String(vehicle.remainingKwh));
check("取消后柜位重新可约", store.slotRemainOf(cabinet.id, 0) === 1);
check("早班标记为取消", store.shifts.find((s) => s.id === "shift-morning")!.active === false);

// 重开 → 满电
store.toggleShift("shift-morning");
check("重开后车辆满电", vehicle.remainingKwh === vehicle.capacityKwh, String(vehicle.remainingKwh));
check("日志记录了取消与重开", store.logs.some((l) => l.type === "取消班次") && store.logs.some((l) => l.type === "重开班次"));

// 换车释放流程
const r3 = store.dispatch(order.id, "v-002", cabinet.id, 0);
check("满电后重派成功", r3.ok, r3.message);
store.changeVehicle(order.id);
check("换车后退回待处理", order.status === "待处理");
check("换车后预约释放", order.cabinetId === "");
check("换车后柜位恢复", store.slotRemainOf(cabinet.id, 0) === 1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
