import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { evaluate, remainingAfter, round2, slotRemain } from "./engine";
import { loadState, saveState } from "./storage";
import { seedState } from "./seed";
import type {
  Cabinet,
  CabinetSlot,
  LogType,
  Order,
  OrderStatus,
  Shift,
  SwapLog,
  TempZone,
  Vehicle
} from "./types";

// 编排层：调用纯判断（engine）决定结果，再落到状态并交给 storage 持久化
const initial = loadState();

function makeLog(type: LogType, message: string): SwapLog {
  return {
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    type,
    message
  };
}

export const useSwapStore = defineStore("swap-desk", () => {
  const shifts = ref<Shift[]>(structuredClone(initial.shifts));
  const vehicles = ref<Vehicle[]>(structuredClone(initial.vehicles));
  const cabinets = ref<Cabinet[]>(structuredClone(initial.cabinets));
  const orders = ref<Order[]>(structuredClone(initial.orders));
  const logs = ref<SwapLog[]>(structuredClone(initial.logs ?? []));

  function pushLog(type: LogType, message: string) {
    logs.value.unshift(makeLog(type, message));
    if (logs.value.length > 60) logs.value.length = 60;
  }

  function snapshot() {
    return {
      version: 1 as const,
      shifts: shifts.value,
      vehicles: vehicles.value,
      cabinets: cabinets.value,
      orders: orders.value,
      logs: logs.value
    };
  }

  function persist() {
    saveState(snapshot());
  }

  // -------- 查询 --------
  const pendingOrders = computed(() => orders.value.filter((o) => o.status === "待处理"));
  const dispatchedOrders = computed(() => orders.value.filter((o) => o.status === "已派单"));
  const doneOrders = computed(() => orders.value.filter((o) => o.status === "已送达"));
  const activeShifts = computed(() => shifts.value.filter((s) => s.active));

  const vehiclesByShift = computed(() => {
    const map = new Map<string, Vehicle[]>();
    for (const s of shifts.value) map.set(s.id, []);
    for (const v of vehicles.value) map.get(v.shiftId)?.push(v);
    return map;
  });

  function shiftName(id: string) {
    return shifts.value.find((s) => s.id === id)?.name ?? "未排班";
  }
  function vehicleById(id: string) {
    return vehicles.value.find((v) => v.id === id);
  }
  function cabinetById(id: string) {
    return cabinets.value.find((c) => c.id === id);
  }
  function slotRemainOf(cabinetId: string, slotIndex: number) {
    const cabinet = cabinetById(cabinetId);
    if (!cabinet) return 0;
    return slotRemain(snapshot(), cabinet, slotIndex);
  }

  // -------- 订单资料 --------
  function addOrder(input: {
    address: string;
    distanceKm: number;
    windowStart: string;
    windowEnd: string;
    zone: TempZone;
  }) {
    const seq = String(orders.value.length + 1).padStart(2, "0");
    const order: Order = {
      id: crypto.randomUUID(),
      no: `D${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${seq}`,
      address: input.address,
      distanceKm: round2(input.distanceKm),
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      zone: input.zone,
      status: "待处理",
      vehicleId: "",
      cabinetId: "",
      slotStart: "",
      slotEnd: "",
      charged: false,
      consumedKwh: 0,
      remainingBeforeKwh: 0,
      reason: "",
      createdAt: new Date().toISOString()
    };
    orders.value.unshift(order);
    pushLog("资料", `新订单 ${order.no}（${order.zone} ${order.distanceKm}km）进入待处理`);
    persist();
  }

  // -------- 车辆 / 换电柜资料 --------
  function addVehicle(input: {
    plate: string;
    shiftId: string;
    zone: TempZone;
    capacityKwh: number;
    remainingKwh: number;
    kwhPerKm: number;
  }) {
    vehicles.value.push({ id: crypto.randomUUID(), ...input });
    pushLog("资料", `新增车辆 ${input.plate}（${input.zone}，余电 ${input.remainingKwh}度）`);
    persist();
  }

  function updateRemaining(vehicleId: string, value: number) {
    const v = vehicleById(vehicleId);
    if (!v) return;
    v.remainingKwh = round2(Math.min(v.capacityKwh, Math.max(0, value)));
    persist();
  }

  function addCabinet(input: { name: string; detourKm: number; slots: CabinetSlot[] }) {
    cabinets.value.push({ id: crypto.randomUUID(), ...input });
    pushLog("资料", `新增换电柜 ${input.name}，${input.slots.length} 个可约时段`);
    persist();
  }

  // -------- 派单 --------
  /**
   * 派单：先经 engine.evaluate 纯判断。
   * 通过 → 占用柜位、扣减耗电、换电单按满电起算；
   * 不通过 → 订单留在待处理并写明缺多少公里 / 温区不符 / 柜位约满。
   */
  function dispatch(
    orderId: string,
    vehicleId: string,
    cabinetId: string,
    slotIndex: number
  ): { ok: boolean; message: string } {
    const order = orders.value.find((o) => o.id === orderId);
    const vehicle = vehicleById(vehicleId);
    if (!order || !vehicle) return { ok: false, message: "请选择车辆" };

    const plan = evaluate(snapshot(), vehicle, order, cabinetId, slotIndex);
    if (!plan.ok) {
      order.status = "待处理";
      order.reason = plan.reason;
      pushLog("派单", `${order.no} 派给 ${vehicle.plate} 被拦下：${plan.reason}`);
      persist();
      return { ok: false, message: plan.reason };
    }

    order.status = "已派单";
    order.vehicleId = vehicle.id;
    order.charged = plan.charged;
    order.remainingBeforeKwh = vehicle.remainingKwh;
    order.consumedKwh = plan.consumedKwh;
    if (plan.charged) {
      const cabinet = cabinetById(plan.cabinetId)!;
      const slot = cabinet.slots[plan.slotIndex];
      order.cabinetId = cabinet.id;
      order.slotStart = slot.start;
      order.slotEnd = slot.end;
    } else {
      order.cabinetId = "";
      order.slotStart = "";
      order.slotEnd = "";
    }
    order.reason = plan.reason;
    vehicle.remainingKwh = remainingAfter(vehicle, order, plan);

    pushLog(
      "派单",
      `${order.no} → ${vehicle.plate}：${plan.reason}，核算耗电 ${plan.consumedKwh}度，接单后余电 ${vehicle.remainingKwh}度`
    );
    persist();
    return { ok: true, message: plan.reason };
  }

  /** 释放某单占用的预约，车辆恢复到派单前余电（单还没真正跑，换电单退回旧电池状态） */
  function releaseOrder(order: Order, why: string) {
    const vehicle = vehicleById(order.vehicleId);
    if (vehicle) {
      vehicle.remainingKwh = round2(
        Math.min(vehicle.capacityKwh, Math.max(0, order.remainingBeforeKwh))
      );
    }
    const cabinetName = order.cabinetId ? cabinetById(order.cabinetId)?.name ?? "换电柜" : "";
    order.cabinetId = "";
    order.slotStart = "";
    order.slotEnd = "";
    order.charged = false;
    order.consumedKwh = 0;
    order.remainingBeforeKwh = 0;
    order.vehicleId = "";
    order.status = "待处理";
    order.reason = why;
    pushLog("释放", `${order.no}：${why}${cabinetName ? `，已释放${cabinetName}预约` : ""}`);
    persist();
  }

  /** 换车：先释放原车预约，订单退回待处理，再由调度重新派给新车 */
  function changeVehicle(orderId: string) {
    const order = orders.value.find((o) => o.id === orderId);
    if (!order || order.status !== "已派单") return;
    const oldPlate = vehicleById(order.vehicleId)?.plate ?? "原车";
    releaseOrder(order, `骑手申请换车，已从${oldPlate}撤出`);
    pushLog("换车", `${order.no} 等待重新派车`);
    persist();
  }

  function completeOrder(orderId: string) {
    const order = orders.value.find((o) => o.id === orderId);
    if (!order || order.status !== "已派单") return;
    order.status = "已送达" satisfies OrderStatus;
    // 柜位预约随送达自然释放（统计已排除已送达订单）
    order.cabinetId = "";
    order.slotStart = "";
    order.slotEnd = "";
    pushLog("完成", `${order.no} 已送达，柜位预约释放`);
    persist();
  }

  // -------- 班次 --------
  /**
   * 取消班次：释放该班次所有在途订单的换电预约，订单退回待处理并写明原因；
   * 重开：车辆按满电重新出勤，排程与原因仍保留在列表/日志里可查。
   */
  function toggleShift(shiftId: string) {
    const shift = shifts.value.find((s) => s.id === shiftId);
    if (!shift) return;
    shift.active = !shift.active;

    if (!shift.active) {
      const inFlight = orders.value.filter(
        (o) => o.status === "已派单" && vehicleById(o.vehicleId)?.shiftId === shiftId
      );
      for (const order of inFlight) {
        releaseOrder(order, `${shift.name}已取消，换电预约释放，待重新排班`);
      }
      pushLog("取消班次", `${shift.name}取消，${inFlight.length} 单退回待处理`);
    } else {
      for (const v of vehicles.value) {
        if (v.shiftId === shiftId) v.remainingKwh = v.capacityKwh;
      }
      pushLog("重开班次", `${shift.name}重开，车辆按满电出勤，历史排程保留可查`);
    }
    persist();
  }

  function resetAll() {
    const seeded = seedState();
    shifts.value = seeded.shifts;
    vehicles.value = seeded.vehicles;
    cabinets.value = seeded.cabinets;
    orders.value = seeded.orders;
    logs.value = [makeLog("重置", "已恢复示例资料")];
    persist();
  }

  return {
    // state
    shifts,
    vehicles,
    cabinets,
    orders,
    logs,
    activeShifts,
    pendingOrders,
    dispatchedOrders,
    doneOrders,
    vehiclesByShift,
    // queries
    shiftName,
    vehicleById,
    cabinetById,
    slotRemainOf,
    // actions
    addOrder,
    addVehicle,
    addCabinet,
    updateRemaining,
    dispatch,
    releaseOrder,
    changeVehicle,
    completeOrder,
    toggleShift,
    resetAll
  };
});
