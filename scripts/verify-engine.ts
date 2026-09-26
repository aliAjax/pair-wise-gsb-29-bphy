import { seedState } from "../src/swap/seed";
import { evaluate, remainRangeKm, shortKm, slotRemain } from "../src/swap/engine";
import type { DispatchPlan } from "../src/swap/engine";

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

const state = seedState();
const [v1, v2, v3] = state.vehicles;
const [c1, c2] = state.cabinets;
const [o1, o2, o3] = state.orders;

const ev = (v: typeof v1, o: typeof o1, c = "", i = -1): DispatchPlan =>
  evaluate(state, v, o, c, i);

// 1. 余电够：常温车 1.8 度 / 0.05 = 36km，6km 单直送
let p = ev(v1, o1);
check("余电充足直送", p.ok && !p.charged && p.routeKm === 6, JSON.stringify(p));

// 2. 冷藏车 0.4 度 / 0.08 = 5km，14km 单不选柜 → 缺 9km
p = ev(v2, o2);
check("不选柜时写明缺公里数", !p.ok && p.reason.includes("9 公里"), p.reason);
check("shortKm 折算=9", shortKm(v2, o2) === 9, String(shortKm(v2, o2)));

// 3. 选陆家嘴柜（绕路2km，10:00 容量1）：余电可跑5km 够到柜；满电 2/0.08=25km 够 14km → 换电
p = ev(v2, o2, c2.id, 0);
check("绕路换电方案成立", p.ok && p.charged && p.routeKm === 16, p.reason);

// 4. 占用该柜位后，再派一次 → 约满
state.orders.push({
  ...o2,
  id: "o-fake",
  status: "已派单",
  cabinetId: c2.id,
  slotStart: "10:00",
  slotEnd: "10:30"
});
check("占用后柜位余量为0", slotRemain(state, c2, 0) === 0);
p = ev(v2, o2, c2.id, 0);
check("柜位约满被拦", !p.ok && p.reason.includes("约满"), p.reason);
state.orders.pop();

// 5. 温区不符：冷藏车接冷冻单
p = ev(v2, o3);
check("温区不符被拦", !p.ok && p.reason.includes("温区不符"), p.reason);

// 6. 冷冻车余电 2.2/0.1=22km，9km 冷冻单直送（无需换电）
p = ev(v3, o3);
check("冷冻车直送", p.ok && !p.charged, JSON.stringify(p));

// 7. 取消早班后 v2 不可派
state.shifts[0].active = false;
p = ev(v2, o2, c2.id, 0);
check("班次取消拒派", !p.ok && p.reason.includes("已取消"), p.reason);
state.shifts[0].active = true;

// 8. 绕路太远骑不到柜：把 v2 余电压到 0.1 度（1km），绕路 2km 到不了
v2.remainingKwh = 0.1;
check("余电仅跑1km", remainRangeKm(v2) === 1.25, String(remainRangeKm(v2)));
p = ev(v2, o2, c2.id, 0);
check("骑不到柜被拦（缺绕路里程）", !p.ok && p.reason.includes("骑到"), p.reason);

// 9. 世纪大道柜 08:00 容量1、绕路1.2km：余电1.25km 勉强够 → 但08点在承诺10-12内，且班次内 → 成功
p = ev(v2, o2, c1.id, 0);
check("1.2km绕路勉强到柜，换电成立", p.ok && p.charged, p.reason);

// 10. 时段晚于承诺截止：晚班冷冻车低电，用 15:00 档去送承诺 12:00 截止的冷冻单 → 拦
v3.remainingKwh = 0.5; // 余电可跑 5km，绕路 2km 够到柜
const frozenMorning = { ...o1, id: "o-frozen-m", zone: "冷冻" as const, distanceKm: 20 };
p = ev(v3, frozenMorning, c2.id, 1);
check("换电时段晚于承诺截止被拦", !p.ok && p.reason.includes("承诺"), p.reason);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
