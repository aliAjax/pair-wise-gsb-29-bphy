<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useSwapStore } from "../swap/store";
import { evaluate, remainRangeKm, round2 } from "../swap/engine";
import { showToast } from "../swap/toast";
import type { Order, Shift } from "../swap/types";

// 派单台：待处理订单选车、选柜、选时段；判断实时预演，被拦下的单写明缺多少公里
const store = useSwapStore();

interface Draft {
  vehicleId: string;
  cabinetSlot: string; // `${cabinetId}::${slotIndex}`，"direct" 表示直送
}

const drafts = reactive<Record<string, Draft>>({});

function draftOf(order: Order): Draft {
  if (!drafts[order.id]) drafts[order.id] = { vehicleId: "", cabinetSlot: "" };
  return drafts[order.id];
}

watch(
  () => store.orders.map((o) => o.id).join(","),
  () => {
    for (const o of store.pendingOrders) draftOf(o);
  },
  { immediate: true }
);

const slotOptions = computed(() =>
  store.cabinets.flatMap((c) =>
    c.slots.map((slot, i) => ({
      value: `${c.id}::${i}`,
      label: `${c.name} ${slot.start}-${slot.end}（绕路${c.detourKm}km，余${store.slotRemainOf(c.id, i)}）`,
      cabinetId: c.id,
      slotIndex: i
    }))
  )
);

const directValue = "direct";

function parseSlot(raw: string) {
  if (!raw || raw === directValue) return { cabinetId: "", slotIndex: -1 };
  const [cabinetId, indexRaw] = raw.split("::");
  return { cabinetId, slotIndex: Number(indexRaw) };
}

function preview(order: Order) {
  const draft = draftOf(order);
  const vehicle = store.vehicleById(draft.vehicleId);
  if (!vehicle) return null;
  const { cabinetId, slotIndex } = parseSlot(draft.cabinetSlot);
  return evaluate(
    {
      version: 1,
      shifts: store.shifts,
      vehicles: store.vehicles,
      cabinets: store.cabinets,
      orders: store.orders,
      logs: []
    },
    vehicle,
    order,
    cabinetId,
    slotIndex
  );
}

function doDispatch(order: Order) {
  const draft = draftOf(order);
  const { cabinetId, slotIndex } = parseSlot(draft.cabinetSlot);
  const result = store.dispatch(order.id, draft.vehicleId, cabinetId, slotIndex);
  showToast(result.message, result.ok ? "ok" : "err");
}

function zoneLabel(o: Order) {
  return o.zone;
}

function shiftLabel(s: Shift) {
  return s.active ? s.name : `${s.name}（已取消）`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <section class="panel order-desk">
    <div class="panel-head">
      <h2>待处理订单 · 派单</h2>
      <span class="hint">绕路耗电计入判断；换电后按满电接单</span>
    </div>

    <div v-if="store.pendingOrders.length === 0" class="empty">
      暂无待处理订单，所有订单都已排上
    </div>

    <article v-for="order in store.pendingOrders" :key="order.id" class="order-card">
      <div class="record-head">
        <div>
          <p class="record-title">{{ order.no }} · {{ order.address }}</p>
          <p class="order-meta">
            <span class="zone" :class="`zone-${order.zone}`">{{ zoneLabel(order) }}</span>
            <span>{{ order.distanceKm }}km</span>
            <span>承诺 {{ order.windowStart }}-{{ order.windowEnd }}</span>
            <span class="dim">进入 {{ fmtTime(order.createdAt) }}</span>
          </p>
        </div>
      </div>

      <p v-if="order.reason" class="reject-reason">上次未派成：{{ order.reason }}</p>

      <div class="dispatch-row">
        <label>
          车辆（班次 / 温区 / 余电可跑）
          <select v-model="draftOf(order).vehicleId">
            <option value="">请选择车辆</option>
            <optgroup v-for="shift in store.shifts" :key="shift.id" :label="shiftLabel(shift)">
              <option
                v-for="v in store.vehiclesByShift.get(shift.id) ?? []"
                :key="v.id"
                :value="v.id"
              >
                {{ v.plate }} · {{ v.zone }}厢 · 余{{ round2(remainRangeKm(v)) }}km
              </option>
            </optgroup>
          </select>
        </label>

        <label>
          换电柜时段（余电够时可直送）
          <select v-model="draftOf(order).cabinetSlot">
            <option value="">请选择</option>
            <option :value="directValue">不换电，直接送</option>
            <option v-for="opt in slotOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>

        <button type="button" class="dispatch-btn" @click="doDispatch(order)">派单</button>
      </div>

      <div v-if="preview(order)" class="preview" :class="preview(order)!.ok ? 'preview-ok' : 'preview-err'">
        <template v-if="preview(order)!.ok">
          ✓ {{ preview(order)!.reason }}，全程 {{ preview(order)!.routeKm }}km
        </template>
        <template v-else>✗ {{ preview(order)!.reason }}</template>
      </div>
    </article>
  </section>
</template>
