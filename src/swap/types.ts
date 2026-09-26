// 换电排程台的资料模型：车辆 / 换电柜 / 订单 / 班次 / 排程日志

export type TempZone = "常温" | "冷藏" | "冷冻";

export const TEMP_ZONES: readonly TempZone[] = ["常温", "冷藏", "冷冻"];

export type OrderStatus = "待处理" | "已派单" | "已送达";

/** 班次：取消班次后其名下车辆的换电预约全部释放 */
export interface Shift {
  id: string;
  name: string;
  start: string; // "07:00"
  end: string; // "13:00"
  active: boolean;
}

/** 车辆：记余电、每公里耗电和所属班次（温区由车厢决定） */
export interface Vehicle {
  id: string;
  plate: string;
  shiftId: string;
  zone: TempZone;
  capacityKwh: number; // 满电电量
  remainingKwh: number; // 当前余电
  kwhPerKm: number; // 每公里耗电
}

/** 换电柜单个可约时段 */
export interface CabinetSlot {
  start: string; // "10:00"
  end: string; // "10:30"
  capacity: number; // 可约柜位数
}

/** 换电柜：绕路里程用于计算“骑到柜”要耗多少电 */
export interface Cabinet {
  id: string;
  name: string;
  detourKm: number;
  slots: CabinetSlot[];
}

/** 订单：记距离、承诺时段和温区 */
export interface Order {
  id: string;
  no: string;
  address: string;
  distanceKm: number;
  windowStart: string; // 承诺送达时段起
  windowEnd: string; // 承诺送达时段止
  zone: TempZone;
  status: OrderStatus;
  vehicleId: string;
  cabinetId: string; // 派单时占用的换电柜预约，空表示直送
  slotStart: string;
  slotEnd: string;
  charged: boolean; // 是否按“换电后满电”接单
  consumedKwh: number; // 接单时核算的总耗电（换电单含绕路到柜），用于展示
  remainingBeforeKwh: number; // 派单前余电，取消班次/换车释放时恢复
  reason: string; // 留在待处理的原因（缺多少公里 / 温区不符 / 柜位约满）
  createdAt: string;
}

export type LogType =
  | "派单"
  | "释放"
  | "完成"
  | "取消班次"
  | "重开班次"
  | "换车"
  | "资料"
  | "重置";

export interface SwapLog {
  id: string;
  time: string;
  type: LogType;
  message: string;
}

export interface SwapState {
  version: number;
  shifts: Shift[];
  vehicles: Vehicle[];
  cabinets: Cabinet[];
  orders: Order[];
  logs: SwapLog[];
}
