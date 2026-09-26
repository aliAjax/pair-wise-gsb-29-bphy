export const TEMP_ZONES = ["常温", "冷藏", "冷冻"] as const;
export type TempZone = (typeof TEMP_ZONES)[number];

export const PROMISED_SLOTS = ["08:00-10:00", "10:00-12:00", "14:00-16:00", "16:00-18:00"] as const;

export const ORDER_STATUSES = ["待处理", "已排程", "已送达"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Vehicle {
  id: string;
  name: string;
  batteryPct: number; // 余电 %
  consumptionPerKm: number; // 每公里耗电 %
  tempZones: TempZone[]; // 车厢支持的温区
  shift: string; // 班次
  shiftActive: boolean; // 班次是否有效
}

export interface CabinetSlot {
  id: string;
  time: string; // 可约时段
  capacity: number; // 柜位数
}

export interface Cabinet {
  id: string;
  name: string;
  detourKm: number; // 绕路公里（去柜往返）
  slots: CabinetSlot[];
}

export interface SwapBooking {
  cabinetId: string;
  slotId: string;
}

export interface Order {
  id: string;
  address: string;
  distanceKm: number; // 距离
  promisedSlot: string; // 承诺时段
  tempZone: TempZone; // 温区
  status: OrderStatus;
  vehicleId: string | null;
  booking: SwapBooking | null; // 换电预约
  reason: string; // 排程说明 / 待处理原因（含缺多少公里）
  createdAt: string;
}

export interface State {
  vehicles: Vehicle[];
  cabinets: Cabinet[];
  orders: Order[];
}

export function seedState(): State {
  return {
    vehicles: [
      {
        id: "veh-a",
        name: "车A",
        batteryPct: 35,
        consumptionPerKm: 2.5,
        tempZones: ["常温", "冷藏"],
        shift: "早班 08:00-14:00",
        shiftActive: true
      },
      {
        id: "veh-b",
        name: "车B",
        batteryPct: 40,
        consumptionPerKm: 2,
        tempZones: ["常温"],
        shift: "中班 10:00-16:00",
        shiftActive: true
      },
      {
        id: "veh-c",
        name: "车C",
        batteryPct: 15,
        consumptionPerKm: 3,
        tempZones: ["常温", "冷藏", "冷冻"],
        shift: "早班 08:00-14:00",
        shiftActive: true
      }
    ],
    cabinets: [
      {
        id: "cab-1",
        name: "世纪大道柜",
        detourKm: 1.5,
        slots: [
          { id: "cab-1-s1", time: "08:00-10:00", capacity: 2 },
          { id: "cab-1-s2", time: "10:00-12:00", capacity: 2 },
          { id: "cab-1-s3", time: "14:00-16:00", capacity: 1 }
        ]
      },
      {
        id: "cab-2",
        name: "陆家嘴柜",
        detourKm: 3,
        slots: [
          { id: "cab-2-s1", time: "10:00-12:00", capacity: 1 },
          { id: "cab-2-s2", time: "14:00-16:00", capacity: 2 }
        ]
      }
    ],
    orders: [
      "静安寺 8 号|4|08:00-10:00|常温",
      "世纪大道 100 号|12|10:00-12:00|常温",
      "陆家嘴环路 58 号|6|10:00-12:00|冷藏",
      "张江高科 299 号|18|14:00-16:00|冷冻",
      "五角场 22 号|26|14:00-16:00|常温",
      "崇明岛 1 号|45|14:00-16:00|冷冻"
    ].map((line, index) => {
      const [address, distanceKm, promisedSlot, tempZone] = line.split("|");
      return {
        id: `seed-${index + 1}`,
        address,
        distanceKm: Number(distanceKm),
        promisedSlot,
        tempZone: tempZone as TempZone,
        status: "待处理" as OrderStatus,
        vehicleId: null,
        booking: null,
        reason: "待派单",
        createdAt: new Date(Date.now() - index * 3600000).toISOString()
      };
    })
  };
}
