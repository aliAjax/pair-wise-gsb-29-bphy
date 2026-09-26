import type { Cabinet, Order, SwapState, Vehicle } from "./types";

// 判断层：全部为纯函数，不改状态，只描述“能不能派、缺多少、走哪条方案”

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** 满电可跑里程 */
export function maxRangeKm(v: Vehicle): number {
  return v.kwhPerKm > 0 ? v.capacityKwh / v.kwhPerKm : 0;
}

/** 当前余电可跑里程 */
export function remainRangeKm(v: Vehicle): number {
  return v.kwhPerKm > 0 ? v.remainingKwh / v.kwhPerKm : 0;
}

/** 订单行驶耗电（含可选绕路） */
export function needKwh(v: Vehicle, order: Order, detourKm = 0): number {
  return Math.max(0, order.distanceKm + detourKm) * v.kwhPerKm;
}

/** 还差多少公里的电量：按订单距离折算，正值即缺的里程 */
export function shortKm(v: Vehicle, order: Order, detourKm = 0): number {
  return round2(Math.max(0, order.distanceKm + detourKm - remainRangeKm(v)));
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** 某个柜位时段在当前排程里已被占用的次数（仅统计已派单且未完成的订单） */
export function slotTaken(state: SwapState, cabinetId: string, start: string, end: string): number {
  return state.orders.filter(
    (o) =>
      o.status !== "已送达" &&
      o.cabinetId === cabinetId &&
      overlaps(o.slotStart, o.slotEnd, start, end)
  ).length;
}

export function slotRemain(state: SwapState, cabinet: Cabinet, index: number): number {
  const slot = cabinet.slots[index];
  return Math.max(0, slot.capacity - slotTaken(state, cabinet.id, slot.start, slot.end));
}

export interface DispatchPlan {
  ok: boolean;
  charged: boolean;
  cabinetId: string;
  slotIndex: number;
  /** 提示骑手的总行驶里程（含绕路） */
  routeKm: number;
  /** 本次接单核算的总耗电（换电单含绕路到柜） */
  consumedKwh: number;
  reason: string;
}

/**
 * 派单判断：
 * 1. 温区不符 → 拒绝
 * 2. 余电够直送（订单距离）→ 直送
 * 3. 否则找换电柜：柜位能约 + 绕路余电够骑到柜 + 换电后满电够跑订单 → 换电方案
 * 4. 都不行 → 拒绝，并写明缺多少公里 / 柜位约满 / 时段不符
 */
export function evaluate(
  state: SwapState,
  vehicle: Vehicle,
  order: Order,
  cabinetId: string,
  slotIndex: number
): DispatchPlan {
  const fail = (reason: string): DispatchPlan => ({
    ok: false,
    charged: false,
    cabinetId: "",
    slotIndex: -1,
    routeKm: order.distanceKm,
    consumedKwh: 0,
    reason
  });

  const shift = state.shifts.find((s) => s.id === vehicle.shiftId);
  if (shift && !shift.active) {
    return fail(`${shift.name}已取消，车辆暂不出勤`);
  }

  if (vehicle.zone !== order.zone) {
    return fail(`温区不符：车辆为${vehicle.zone}，订单要求${order.zone}`);
  }

  // 直送：当前余电可覆盖订单距离
  if (remainRangeKm(vehicle) >= order.distanceKm + 1e-9) {
    return {
      ok: true,
      charged: false,
      cabinetId: "",
      slotIndex: -1,
      routeKm: order.distanceKm,
      consumedKwh: round2(needKwh(vehicle, order)),
      reason: "余电充足，直送即可"
    };
  }

  const cabinet = state.cabinets.find((c) => c.id === cabinetId);
  const slot = cabinet?.slots[slotIndex];
  if (!cabinet || !slot) {
    return fail(`余电不足，还差 ${shortKm(vehicle, order)} 公里，需选换电柜及时段`);
  }

  // 预约时段须落在班次内，且不晚于承诺送达截止时间
  if (shift && (slot.start < shift.start || slot.end > shift.end)) {
    return fail(`换电时段 ${slot.start}-${slot.end} 不在${shift.name}内`);
  }
  if (slot.end > order.windowEnd) {
    return fail(`换电时段 ${slot.start}-${slot.end} 晚于承诺送达截止 ${order.windowEnd}`);
  }

  // 柜位约满
  const remain = slotRemain(state, cabinet, slotIndex);
  if (remain <= 0) {
    return fail(`${cabinet.name} ${slot.start}-${slot.end} 柜位约满`);
  }

  // 绕路耗电：凭当前余电要能骑到柜
  const detour = cabinet.detourKm;
  if (remainRangeKm(vehicle) < detour + 1e-9) {
    return fail(
      `余电不足：骑到${cabinet.name}需 ${round2(detour - remainRangeKm(vehicle))} 公里电量（绕路 ${detour}km）`
    );
  }

  // 换电后按满电接单：满电里程须覆盖订单距离
  if (maxRangeKm(vehicle) < order.distanceKm + 1e-9) {
    return fail(
      `满电也不够：${vehicle.plate}满电可跑 ${round2(maxRangeKm(vehicle))}km，订单 ${order.distanceKm}km，缺 ${round2(
        order.distanceKm - maxRangeKm(vehicle)
      )} 公里`
    );
  }

  return {
    ok: true,
    charged: true,
    cabinetId: cabinet.id,
    slotIndex,
    routeKm: round2(detour + order.distanceKm),
    consumedKwh: round2(needKwh(vehicle, order, detour)),
    reason: `余电不足，绕路 ${detour}km 到${cabinet.name}换电（${slot.start}-${slot.end}），满电后送达，全程 ${round2(
      detour + order.distanceKm
    )}km`
  };
}

/** 派单成功后车辆新的余电；换电单按满电跑完订单剩余里程 */
export function remainingAfter(vehicle: Vehicle, order: Order, plan: DispatchPlan): number {
  if (plan.charged) {
    return round2(Math.max(0, vehicle.capacityKwh - order.distanceKm * vehicle.kwhPerKm));
  }
  return round2(Math.max(0, vehicle.remainingKwh - order.distanceKm * vehicle.kwhPerKm));
}
