<script setup lang="ts">
import { computed, ref } from "vue";
import ShiftBoard from "./components/ShiftBoard.vue";
import CabinetBoard from "./components/CabinetBoard.vue";
import OrderDesk from "./components/OrderDesk.vue";
import ScheduleList from "./components/ScheduleList.vue";
import DataPanel from "./components/DataPanel.vue";
import LogPanel from "./components/LogPanel.vue";
import { useSwapStore } from "./swap/store";
import { remainRangeKm } from "./swap/engine";
import { toast } from "./swap/toast";

const store = useSwapStore();

const tabs = [
  { key: "desk", label: "换电排程台" },
  { key: "data", label: "资料建档" },
  { key: "logs", label: "排程日志" }
] as const;
type TabKey = (typeof tabs)[number]["key"];
const tab = ref<TabKey>("desk");

const blockedCount = computed(
  () => store.pendingOrders.filter((o) => o.reason).length
);
const swapBookings = computed(
  () => store.dispatchedOrders.filter((o) => o.charged).length
);
const lowBattery = computed(
  () => store.vehicles.filter((v) => remainRangeKm(v) < 10).length
);

const metrics = computed(() => [
  { label: "待处理 / 被拦回", value: `${store.pendingOrders.length} / ${blockedCount.value}` },
  { label: "在途换电预约", value: String(swapBookings.value) },
  { label: "低电车辆（不足10km）", value: String(lowBattery.value) }
]);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业前端最小闭环 · 末端配送换电排程</p>
          <h1>换电排程台</h1>
          <p class="subtitle">
            车辆记余电、每公里耗电与班次；换电柜记可约时段；订单记距离、承诺时段与温区。
            派单把绕路耗电算进去，余电不足先约柜、换电后按满电接单；缺电、温区不符或柜位约满的单留在待处理并写明缺多少公里。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">Pinia</span>
          <span class="tag">TypeScript</span>
          <span class="tag">localStorage</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <nav class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          :class="['tab', tab === t.key ? 'tab-active' : 'secondary']"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
        <button type="button" class="secondary tab-reset" @click="store.resetAll()">恢复示例资料</button>
      </nav>

      <div v-if="tab === 'desk'" class="desk-grid">
        <div class="desk-main">
          <OrderDesk />
          <ScheduleList />
        </div>
        <div class="desk-side">
          <ShiftBoard />
          <CabinetBoard />
        </div>
      </div>

      <DataPanel v-else-if="tab === 'data'" />
      <LogPanel v-else />
    </div>

    <transition name="toast">
      <div v-if="toast.visible" :class="['toast', toast.kind === 'ok' ? 'toast-ok' : 'toast-err']">
        {{ toast.text }}
      </div>
    </transition>
  </main>
</template>
