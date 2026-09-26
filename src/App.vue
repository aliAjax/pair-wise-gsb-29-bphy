<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { ORDER_STATUSES, PROMISED_SLOTS, TEMP_ZONES, seedState } from "./domain/data";
import type { Order, OrderStatus, State, TempZone } from "./domain/data";
import {
  applyPlan,
  cancelShift,
  dispatchAll,
  fmtKm,
  planDispatch,
  reassign,
  remainingRangeKm,
  resumeShift,
  slotUsage
} from "./domain/dispatch";
import { loadState, saveState } from "./domain/storage";

const stored = loadState();
const state = reactive<State>(stored ?? seedState());
if (!stored) {
  // 首次打开：用种子数据跑一遍派单，生成初始排程与待处理原因
  dispatchAll(state);
  saveState(state);
}

function persist() {
  saveState(state);
}

const form = reactive({
  address: "",
  distanceKm: 5,
  promisedSlot: PROMISED_SLOTS[1] as string,
  tempZone: "常温" as TempZone
});

const filter = ref<OrderStatus | "全部">("全部");

const filteredOrders = computed(() =>
  filter.value === "全部" ? state.orders : state.orders.filter((o) => o.status === filter.value)
);

const metrics = computed(() => [
  state.orders.filter((o) => o.status === "待处理").length,
  state.orders.filter((o) => o.status === "已排程").length,
  state.orders.filter((o) => o.status === "已排程" && o.booking).length
]);

const chartRows = computed(() =>
  ORDER_STATUSES.map((status) => ({
    status,
    value: state.orders.filter((o) => o.status === status).length
  }))
);

const maxChart = computed(() => Math.max(1, ...chartRows.value.map((row) => row.value)));

function vehicleName(id: string | null) {
  return state.vehicles.find((v) => v.id === id)?.name ?? "未指派";
}

function bookingText(order: Order) {
  if (!order.booking) return "";
  const cabinet = state.cabinets.find((c) => c.id === order.booking?.cabinetId);
  const slot = cabinet?.slots.find((s) => s.id === order.booking?.slotId);
  return cabinet && slot ? `${cabinet.name} ${slot.time}` : "";
}

function statusClass(status: OrderStatus) {
  if (status === "待处理") return "pending";
  if (status === "已送达") return "done";
  return "";
}

function addOrder() {
  const order: Order = {
    id: crypto.randomUUID(),
    address: form.address,
    distanceKm: Number(form.distanceKm),
    promisedSlot: form.promisedSlot,
    tempZone: form.tempZone,
    status: "待处理",
    vehicleId: null,
    booking: null,
    reason: "待派单",
    createdAt: new Date().toISOString()
  };
  state.orders.unshift(order);
  dispatchOne(order);
  form.address = "";
  form.distanceKm = 5;
}

function dispatchOne(order: Order) {
  const plan = planDispatch(order, state);
  if (plan.ok) {
    applyPlan(state, order, plan);
  } else {
    order.reason = plan.reason;
  }
  persist();
}

function runDispatchAll() {
  dispatchAll(state);
  persist();
}

function switchVehicle(order: Order) {
  reassign(state, order);
  persist();
}

function complete(order: Order) {
  order.status = "已送达";
  order.reason = `${order.reason}；已送达，柜位已释放`;
  persist();
}

function removeOrder(id: string) {
  // 删除已排程订单同样释放其换电预约（占用由预约派生）
  state.orders = state.orders.filter((o) => o.id !== id);
  persist();
}

function toggleShift(vehicleId: string) {
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return;
  if (vehicle.shiftActive) {
    cancelShift(state, vehicleId);
  } else {
    resumeShift(state, vehicleId);
  }
  persist();
}

function resetAll() {
  const fresh = seedState();
  state.vehicles = fresh.vehicles;
  state.cabinets = fresh.cabinets;
  state.orders = fresh.orders;
  dispatchAll(state);
  persist();
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业前端最小闭环</p>
          <h1>换电排程台</h1>
          <p class="subtitle">
            车辆记余电、每公里耗电和班次，换电柜记可约时段，订单记距离、承诺时段和温区。
            派单时计入绕路耗电，换电后按满电接单；余电不够、温区不符或柜位约满时，订单留在待处理并写明缺多少公里。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">localStorage</span>
        </div>
      </header>

      <section class="metrics">
        <article class="metric">
          <span>待处理订单</span>
          <strong>{{ metrics[0] }}</strong>
        </article>
        <article class="metric">
          <span>已排程</span>
          <strong>{{ metrics[1] }}</strong>
        </article>
        <article class="metric">
          <span>换电预约</span>
          <strong>{{ metrics[2] }}</strong>
        </article>
      </section>

      <section class="workspace">
        <div class="side">
          <form class="panel" @submit.prevent="addOrder">
            <h2>新增订单</h2>
            <div class="form-grid">
              <label>
                地址
                <input v-model="form.address" required placeholder="送货地址" />
              </label>
              <label>
                距离 km
                <input v-model.number="form.distanceKm" type="number" min="0.5" step="0.5" required />
              </label>
              <label>
                承诺时段
                <select v-model="form.promisedSlot">
                  <option v-for="slot in PROMISED_SLOTS" :key="slot">{{ slot }}</option>
                </select>
              </label>
              <label>
                温区
                <select v-model="form.tempZone">
                  <option v-for="zone in TEMP_ZONES" :key="zone">{{ zone }}</option>
                </select>
              </label>
              <button type="submit">下单并派单</button>
            </div>
          </form>

          <section class="panel">
            <h2>车辆与班次</h2>
            <div class="card-list">
              <article
                v-for="vehicle in state.vehicles"
                :key="vehicle.id"
                class="vehicle"
                :class="{ off: !vehicle.shiftActive }"
              >
                <div class="vehicle-head">
                  <span class="vehicle-name">{{ vehicle.name }}</span>
                  <span class="pill" :class="{ warn: !vehicle.shiftActive }">
                    {{ vehicle.shiftActive ? "在班" : "班次已取消" }}
                  </span>
                </div>
                <div class="meta">
                  <span>班次 {{ vehicle.shift }}</span>
                  <span>余电 {{ vehicle.batteryPct }}%</span>
                  <span>可跑 {{ fmtKm(remainingRangeKm(vehicle)) }}km</span>
                  <span>{{ vehicle.consumptionPerKm }}%/km</span>
                </div>
                <div class="battery">
                  <div class="battery-fill" :style="{ width: `${vehicle.batteryPct}%` }" />
                </div>
                <div class="meta">
                  温区
                  <span v-for="zone in vehicle.tempZones" :key="zone" class="pill">{{ zone }}</span>
                </div>
                <div class="actions">
                  <button v-if="vehicle.shiftActive" class="danger" type="button" @click="toggleShift(vehicle.id)">
                    取消班次
                  </button>
                  <button v-else type="button" @click="toggleShift(vehicle.id)">恢复班次</button>
                </div>
              </article>
            </div>
          </section>

          <section class="panel">
            <h2>换电柜</h2>
            <div class="card-list">
              <article v-for="cabinet in state.cabinets" :key="cabinet.id" class="cabinet">
                <div class="vehicle-head">
                  <span class="vehicle-name">{{ cabinet.name }}</span>
                  <span class="pill">绕路 {{ fmtKm(cabinet.detourKm) }}km</span>
                </div>
                <div v-for="slot in cabinet.slots" :key="slot.id" class="slot-row">
                  <span>{{ slot.time }}</span>
                  <div class="bar-track">
                    <div
                      class="bar-fill"
                      :style="{
                        width: `${(slotUsage(state.orders, cabinet.id, slot.id) / slot.capacity) * 100}%`
                      }"
                    />
                  </div>
                  <strong>{{ slotUsage(state.orders, cabinet.id, slot.id) }}/{{ slot.capacity }}</strong>
                </div>
              </article>
            </div>
          </section>
        </div>

        <section class="list-panel">
          <div class="toolbar">
            <h2>订单排程</h2>
            <div class="toolbar-actions">
              <select v-model="filter">
                <option>全部</option>
                <option v-for="status in ORDER_STATUSES" :key="status">{{ status }}</option>
              </select>
              <button type="button" @click="runDispatchAll">一键派单</button>
              <button class="secondary" type="button" @click="resetAll">重置示例</button>
            </div>
          </div>

          <div class="record-grid">
            <div v-if="filteredOrders.length === 0" class="empty">暂无匹配订单</div>
            <article v-for="order in filteredOrders" :key="order.id" class="record">
              <div class="record-head">
                <p class="record-title">{{ order.address }}</p>
                <span class="status" :class="statusClass(order.status)">{{ order.status }}</span>
              </div>
              <div class="details">
                <span>距离: {{ order.distanceKm }}km</span>
                <span>承诺时段: {{ order.promisedSlot }}</span>
                <span>温区: {{ order.tempZone }}</span>
                <span>车辆: {{ vehicleName(order.vehicleId) }}</span>
                <span v-if="order.booking">换电预约: {{ bookingText(order) }}</span>
              </div>
              <p class="note">{{ order.reason }}</p>
              <div class="actions">
                <button v-if="order.status === '待处理'" type="button" @click="dispatchOne(order)">派单</button>
                <template v-if="order.status === '已排程'">
                  <button type="button" @click="complete(order)">送达</button>
                  <button class="secondary" type="button" @click="switchVehicle(order)">换车</button>
                </template>
                <button class="danger" type="button" @click="removeOrder(order.id)">删除</button>
              </div>
            </article>
          </div>

          <div class="mini-chart">
            <div v-for="row in chartRows" :key="row.status" class="bar">
              <span>{{ row.status }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" /></div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
