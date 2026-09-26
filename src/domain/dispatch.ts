import type { Cabinet, CabinetSlot, Order, State, Vehicle } from "./data";

export interface DispatchPlan {
  ok: boolean;
  vehicleId: string | null;
  booking: { cabinetId: string; slotId: string } | null;
  needSwap: boolean;
  detourKm: number;
  neededKm: number; // 订单全程公里
  shortKm: number; // 缺口公里（失败时）
  reason: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
export const fmtKm = (n: number) => String(round1(n));

/** 余电可跑公里 */
export function remainingRangeKm(vehicle: Vehicle): number {
  return vehicle.batteryPct / vehicle.consumptionPerKm;
}

/** 时段起点（分钟），用于比较换电时段是否早于承诺时段 */
export function slotStartMinutes(slot: string): number {
  const [start] = slot.split("-");
  const [h, m] = start.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 某柜某时段已占用的柜位数（只统计已排程订单的预约） */
export function slotUsage(orders: Order[], cabinetId: string, slotId: string): number {
  return orders.filter(
    (order) =>
      order.status === "已排程" &&
      order.booking?.cabinetId === cabinetId &&
      order.booking.slotId === slotId
  ).length;
}

function fail(reason: string, neededKm: number, shortKm: number): DispatchPlan {
  return { ok: false, vehicleId: null, booking: null, needSwap: false, detourKm: 0, neededKm, shortKm, reason };
}

/**
 * 派单判断：先直派（余电够全程），不够则找换电柜——
 * 绕路耗电必须靠当前余电覆盖，换电后按满电跑全程。
 */
export function planDispatch(order: Order, state: State, excludeVehicleId: string | null = null): DispatchPlan {
  const neededKm = order.distanceKm;
  const onDuty = state.vehicles.filter((v) => v.shiftActive && v.id !== excludeVehicleId);
  const zoned = onDuty.filter((v) => v.tempZones.includes(order.tempZone));

  if (zoned.length === 0) {
    const zones = onDuty.length
      ? `在班车辆仅支持${[...new Set(onDuty.flatMap((v) => v.tempZones))].join("/")}`
      : "没有在班车辆";
    return fail(`温区不符：订单需${order.tempZone}，${zones}（全程需 ${fmtKm(neededKm)}km）`, neededKm, neededKm);
  }

  // 1) 直派：余电够跑全程，优先余电最充足的车
  const byRange = [...zoned].sort((a, b) => remainingRangeKm(b) - remainingRangeKm(a));
  const direct = byRange.find((v) => remainingRangeKm(v) >= neededKm);
  if (direct) {
    return {
      ok: true,
      vehicleId: direct.id,
      booking: null,
      needSwap: false,
      detourKm: 0,
      neededKm,
      shortKm: 0,
      reason: `直派 ${direct.name}：余电可跑 ${fmtKm(remainingRangeKm(direct))}km ≥ 全程 ${fmtKm(neededKm)}km`
    };
  }

  // 2) 换电派单：绕路到柜（耗当前余电）→ 满电跑全程
  const nearest = byRange[0];
  const shortKm = Math.max(0, neededKm - remainingRangeKm(nearest));
  let best: { vehicle: Vehicle; cabinet: Cabinet; slot: CabinetSlot } | null = null;
  const blockers: string[] = [];

  for (const vehicle of byRange) {
    const range = remainingRangeKm(vehicle);
    const fullRange = 100 / vehicle.consumptionPerKm;
    if (fullRange < neededKm) {
      blockers.push(`${vehicle.name} 满电也只能跑 ${fmtKm(fullRange)}km`);
      continue;
    }
    for (const cabinet of state.cabinets) {
      if (range < cabinet.detourKm) {
        blockers.push(
          `${vehicle.name} 余电可跑 ${fmtKm(range)}km，绕不到${cabinet.name}（绕路 ${fmtKm(cabinet.detourKm)}km）`
        );
        continue;
      }
      const beforePromise = cabinet.slots
        .filter((s) => slotStartMinutes(s.time) <= slotStartMinutes(order.promisedSlot))
        .sort((a, b) => slotStartMinutes(a.time) - slotStartMinutes(b.time));
      const slot = beforePromise.find((s) => slotUsage(state.orders, cabinet.id, s.id) < s.capacity);
      if (!slot) {
        blockers.push(
          beforePromise.length
            ? beforePromise
                .map((s) => `${cabinet.name} ${s.time} ${slotUsage(state.orders, cabinet.id, s.id)}/${s.capacity} 已约满`)
                .join("；")
            : `${cabinet.name} 在承诺时段前没有可约时段`
        );
        continue;
      }
      if (!best || cabinet.detourKm < best.cabinet.detourKm) {
        best = { vehicle, cabinet, slot };
      }
    }
  }

  if (best) {
    return {
      ok: true,
      vehicleId: best.vehicle.id,
      booking: { cabinetId: best.cabinet.id, slotId: best.slot.id },
      needSwap: true,
      detourKm: best.cabinet.detourKm,
      neededKm,
      shortKm: 0,
      reason: `换电派单 ${best.vehicle.name}：绕路 ${fmtKm(best.cabinet.detourKm)}km 到${best.cabinet.name}（${best.slot.time}）换电，满电后跑全程 ${fmtKm(neededKm)}km`
    };
  }

  const onlyCabinetFull =
    blockers.length > 0 && blockers.every((b) => b.includes("已约满") || b.includes("没有可约时段"));
  const head = onlyCabinetFull ? "柜位约满" : "余电不够";
  const details = [...new Set(blockers)].join("；");
  return fail(
    `${head}：全程需 ${fmtKm(neededKm)}km，${nearest.name} 余电可跑 ${fmtKm(remainingRangeKm(nearest))}km，缺 ${fmtKm(shortKm)}km；${details}`,
    neededKm,
    shortKm
  );
}

/** 执行排程：扣电（换电则按满电扣全程）、写入预约与说明 */
export function applyPlan(state: State, order: Order, plan: DispatchPlan): void {
  const vehicle = state.vehicles.find((v) => v.id === plan.vehicleId);
  if (!plan.ok || !vehicle) return;
  if (plan.needSwap) {
    // 绕路耗的是旧电，换电后满电跑全程
    vehicle.batteryPct = round1(100 - order.distanceKm * vehicle.consumptionPerKm);
    order.booking = plan.booking ? { ...plan.booking } : null;
  } else {
    vehicle.batteryPct = round1(vehicle.batteryPct - order.distanceKm * vehicle.consumptionPerKm);
    order.booking = null;
  }
  order.vehicleId = vehicle.id;
  order.status = "已排程";
  order.reason = plan.reason;
}

/** 释放车辆与换电预约，订单回到待处理 */
export function releaseOrder(order: Order, reason: string): void {
  order.status = "待处理";
  order.vehicleId = null;
  order.booking = null;
  order.reason = reason;
}

/** 取消班次：释放该车辆全部换电预约，订单回待处理 */
export function cancelShift(state: State, vehicleId: string): void {
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return;
  vehicle.shiftActive = false;
  for (const order of state.orders) {
    if (order.status === "已排程" && order.vehicleId === vehicleId) {
      releaseOrder(order, `班次取消：${vehicle.name}（${vehicle.shift}）已取消，换电预约已释放，待重新派单`);
    }
  }
}

export function resumeShift(state: State, vehicleId: string): void {
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (vehicle) vehicle.shiftActive = true;
}

/** 换车：释放原预约，改派其他车辆；无人可接则留在待处理 */
export function reassign(state: State, order: Order): DispatchPlan {
  const previousVehicleId = order.vehicleId;
  releaseOrder(order, "换车中…");
  const plan = planDispatch(order, state, previousVehicleId);
  if (plan.ok) {
    applyPlan(state, order, plan);
  } else {
    order.reason = `换车失败，已释放原预约：${plan.reason}`;
  }
  return plan;
}

/** 一键派单：按承诺时段先后处理全部待处理订单 */
export function dispatchAll(state: State): void {
  const pending = state.orders
    .filter((o) => o.status === "待处理")
    .sort((a, b) => slotStartMinutes(a.promisedSlot) - slotStartMinutes(b.promisedSlot));
  for (const order of pending) {
    const plan = planDispatch(order, state);
    if (plan.ok) {
      applyPlan(state, order, plan);
    } else {
      order.reason = plan.reason;
    }
  }
}
