import type { Cabinet, Order, Shift, SwapState, Vehicle } from "./types";

// 首次打开时的示例资料，之后全部走 localStorage
const shifts: Shift[] = [
  { id: "shift-morning", name: "早班 07:00-13:00", start: "07:00", end: "13:00", active: true },
  { id: "shift-evening", name: "晚班 14:00-20:00", start: "14:00", end: "20:00", active: true }
];

const vehicles: Vehicle[] = [
  { id: "v-001", plate: "沪A-05818", shiftId: "shift-morning", zone: "常温", capacityKwh: 2, remainingKwh: 1.8, kwhPerKm: 0.05 },
  { id: "v-002", plate: "沪A-06227", shiftId: "shift-morning", zone: "冷藏", capacityKwh: 2, remainingKwh: 0.4, kwhPerKm: 0.08 },
  { id: "v-003", plate: "沪A-07310", shiftId: "shift-evening", zone: "冷冻", capacityKwh: 2.5, remainingKwh: 2.2, kwhPerKm: 0.1 }
];

const cabinets: Cabinet[] = [
  {
    id: "c-pudong",
    name: "世纪大道换电柜",
    detourKm: 1.2,
    slots: [
      { start: "08:00", end: "08:30", capacity: 1 },
      { start: "10:00", end: "10:30", capacity: 2 }
    ]
  },
  {
    id: "c-lujiazui",
    name: "陆家嘴换电柜",
    detourKm: 2,
    slots: [
      { start: "10:00", end: "10:30", capacity: 1 },
      { start: "15:00", end: "15:30", capacity: 2 }
    ]
  }
];

const now = Date.now();

const orders: Order[] = [
  {
    id: "o-001",
    no: "D20260926-01",
    address: "世纪大道 100 号",
    distanceKm: 6,
    windowStart: "10:00",
    windowEnd: "12:00",
    zone: "常温",
    status: "待处理",
    vehicleId: "",
    cabinetId: "",
    slotStart: "",
    slotEnd: "",
    charged: false,
    consumedKwh: 0,
    remainingBeforeKwh: 0,
    reason: "",
    createdAt: new Date(now - 30 * 60000).toISOString()
  },
  {
    id: "o-002",
    no: "D20260926-02",
    address: "陆家嘴环路 88 号",
    distanceKm: 14,
    windowStart: "10:00",
    windowEnd: "12:00",
    zone: "冷藏",
    status: "待处理",
    vehicleId: "",
    cabinetId: "",
    slotStart: "",
    slotEnd: "",
    charged: false,
    consumedKwh: 0,
    remainingBeforeKwh: 0,
    reason: "",
    createdAt: new Date(now - 20 * 60000).toISOString()
  },
  {
    id: "o-003",
    no: "D20260926-03",
    address: "世博园冷链仓",
    distanceKm: 9,
    windowStart: "15:00",
    windowEnd: "17:00",
    zone: "冷冻",
    status: "待处理",
    vehicleId: "",
    cabinetId: "",
    slotStart: "",
    slotEnd: "",
    charged: false,
    consumedKwh: 0,
    remainingBeforeKwh: 0,
    reason: "",
    createdAt: new Date(now - 10 * 60000).toISOString()
  }
];

export function seedState(): SwapState {
  return {
    version: 1,
    shifts: structuredClone(shifts),
    vehicles: structuredClone(vehicles),
    cabinets: structuredClone(cabinets),
    orders: structuredClone(orders),
    logs: []
  };
}
