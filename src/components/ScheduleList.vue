<script setup lang="ts">
import { computed } from "vue";
import { useSwapStore } from "../swap/store";
import { showToast } from "../swap/toast";

// 已派排程：显示换电预约、绕路方案与拦截原因；换车/取消班次会释放预约
const store = useSwapStore();

const rows = computed(() => [
  ...store.dispatchedOrders,
  ...store.doneOrders
]);

function onChange(orderId: string) {
  store.changeVehicle(orderId);
  showToast("已释放原车与换电柜预约，订单退回待处理重新派车");
}

function onComplete(orderId: string) {
  store.completeOrder(orderId);
  showToast("订单已送达，柜位释放");
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>已排程 · 履约中</h2>
      <span class="hint">重开页面后排程与原因仍在</span>
    </div>

    <div v-if="rows.length === 0" class="empty">暂无已排程订单</div>

    <article v-for="order in rows" :key="order.id" class="schedule-card">
      <div class="record-head">
        <div>
          <p class="record-title">
            {{ order.no }} · {{ order.address }}
            <span class="status" :class="order.status === '已送达' ? 'status-done' : 'status-run'">
              {{ order.status }}
            </span>
          </p>
          <p class="order-meta">
            <span class="zone" :class="`zone-${order.zone}`">{{ order.zone }}</span>
            <span>{{ order.distanceKm }}km</span>
            <span>承诺 {{ order.windowStart }}-{{ order.windowEnd }}</span>
            <span>车辆 {{ store.vehicleById(order.vehicleId)?.plate ?? "—" }}</span>
          </p>
        </div>
      </div>

      <div v-if="order.charged" class="swap-badge">
        🔋 已预约 {{ store.cabinetById(order.cabinetId)?.name ?? "换电柜" }}
        {{ order.slotStart }}-{{ order.slotEnd }}，换电后按满电接单
      </div>
      <div v-else-if="order.status === '已派单'" class="swap-badge direct">
        ⚡ 余电直送，不换电
      </div>

      <p class="note-line">{{ order.reason }}</p>

      <div v-if="order.status === '已派单'" class="actions">
        <button type="button" @click="onComplete(order.id)">
          确认送达
        </button>
        <button type="button" class="secondary" @click="onChange(order.id)">换车（释放预约）</button>
      </div>
    </article>
  </section>
</template>
