<script setup lang="ts">
import { reactive } from "vue";
import { useSwapStore } from "../swap/store";
import { TEMP_ZONES } from "../swap/types";
import type { CabinetSlot, TempZone } from "../swap/types";
import { showToast } from "../swap/toast";

// 资料录入：订单记距离/承诺时段/温区，车辆记余电/每公里耗电/班次，换电柜记可约时段
const store = useSwapStore();

const orderForm = reactive({
  address: "",
  distanceKm: 8,
  windowStart: "10:00",
  windowEnd: "12:00",
  zone: "常温" as TempZone
});

const vehicleForm = reactive({
  plate: "",
  shiftId: "",
  zone: "常温" as TempZone,
  capacityKwh: 2,
  remainingKwh: 2,
  kwhPerKm: 0.06
});

const cabinetForm = reactive({
  name: "",
  detourKm: 1.5,
  slotsText: "10:00-10:30:2\n15:00-15:30:1"
});

function submitOrder() {
  if (!orderForm.address.trim()) return showToast("请填写收货地址", "err");
  if (orderForm.distanceKm <= 0) return showToast("距离需大于 0", "err");
  store.addOrder({ ...orderForm, address: orderForm.address.trim() });
  orderForm.address = "";
  showToast("订单已进入待处理");
}

function submitVehicle() {
  if (!vehicleForm.plate.trim()) return showToast("请填写车牌", "err");
  if (!vehicleForm.shiftId) return showToast("请选择班次", "err");
  if (vehicleForm.kwhPerKm <= 0) return showToast("每公里耗电需大于 0", "err");
  store.addVehicle({ ...vehicleForm, plate: vehicleForm.plate.trim() });
  vehicleForm.plate = "";
  showToast("车辆已加入班次");
}

function parseSlots(text: string): CabinetSlot[] | string {
  const slots: CabinetSlot[] = [];
  for (const line of text.split("\n").map((s) => s.trim()).filter(Boolean)) {
    const m = line.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})[:：](\d+)$/);
    if (!m) return `时段格式有误：${line}（应为 10:00-10:30:2）`;
    const [, start, end, cap] = m;
    if (start >= end) return `时段起止颠倒：${line}`;
    slots.push({ start, end, capacity: Math.max(1, Number(cap)) });
  }
  if (slots.length === 0) return "至少填写一个可约时段";
  return slots;
}

function submitCabinet() {
  if (!cabinetForm.name.trim()) return showToast("请填写换电柜名称", "err");
  const parsed = parseSlots(cabinetForm.slotsText);
  if (typeof parsed === "string") return showToast(parsed, "err");
  store.addCabinet({
    name: cabinetForm.name.trim(),
    detourKm: cabinetForm.detourKm,
    slots: parsed
  });
  cabinetForm.name = "";
  showToast("换电柜与可约时段已建档");
}
</script>

<template>
  <div class="data-grid">
    <section class="panel">
      <h2>新增订单</h2>
      <div class="form-grid">
        <label>收货地址<input v-model="orderForm.address" placeholder="如：世纪大道 100 号" /></label>
        <div class="form-row">
          <label>距离 km
            <input v-model.number="orderForm.distanceKm" type="number" min="0.1" step="0.1" />
          </label>
          <label>温区
            <select v-model="orderForm.zone">
              <option v-for="z in TEMP_ZONES" :key="z" :value="z">{{ z }}</option>
            </select>
          </label>
        </div>
        <div class="form-row">
          <label>承诺起<input v-model="orderForm.windowStart" type="time" /></label>
          <label>承诺止<input v-model="orderForm.windowEnd" type="time" /></label>
        </div>
        <button type="button" @click="submitOrder">进入待处理</button>
      </div>
    </section>

    <section class="panel">
      <h2>新增车辆</h2>
      <div class="form-grid">
        <label>车牌<input v-model="vehicleForm.plate" placeholder="如：沪A-08888" /></label>
        <div class="form-row">
          <label>班次
            <select v-model="vehicleForm.shiftId">
              <option value="">请选择</option>
              <option v-for="s in store.shifts" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <label>温厢
            <select v-model="vehicleForm.zone">
              <option v-for="z in TEMP_ZONES" :key="z" :value="z">{{ z }}</option>
            </select>
          </label>
        </div>
        <div class="form-row">
          <label>满电度<input v-model.number="vehicleForm.capacityKwh" type="number" min="0.1" step="0.1" /></label>
          <label>当前余电度<input v-model.number="vehicleForm.remainingKwh" type="number" min="0" step="0.1" /></label>
        </div>
        <label>每公里耗电（度/km）
          <input v-model.number="vehicleForm.kwhPerKm" type="number" min="0.01" step="0.01" />
        </label>
        <button type="button" @click="submitVehicle">加入班次</button>
      </div>
    </section>

    <section class="panel">
      <h2>新增换电柜</h2>
      <div class="form-grid">
        <label>柜点名称<input v-model="cabinetForm.name" placeholder="如：徐家汇换电柜" /></label>
        <label>绕路里程 km（从配送路线到柜）
          <input v-model.number="cabinetForm.detourKm" type="number" min="0.1" step="0.1" />
        </label>
        <label>可约时段（每行 起-止:柜位数）
          <textarea v-model="cabinetForm.slotsText" rows="3" />
        </label>
        <button type="button" @click="submitCabinet">建立柜点</button>
      </div>
    </section>
  </div>
</template>
