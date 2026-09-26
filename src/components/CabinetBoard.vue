<script setup lang="ts">
import { useSwapStore } from "../swap/store";

// 换电柜：可约时段、柜位余量（随排程实时变化）、绕路里程
const store = useSwapStore();
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>换电柜 · 可约时段</h2>
      <span class="hint">柜位余量随派单/释放实时变化</span>
    </div>

    <div class="cabinet-grid">
      <article v-for="cabinet in store.cabinets" :key="cabinet.id" class="cabinet-card">
        <div class="vehicle-main">
          <strong>{{ cabinet.name }}</strong>
          <span class="tag tag-line">绕路 {{ cabinet.detourKm }}km</span>
        </div>
        <table class="slot-table">
          <thead>
            <tr><th>时段</th><th>柜位</th><th>余量</th></tr>
          </thead>
          <tbody>
            <tr v-for="(slot, i) in cabinet.slots" :key="slot.start">
              <td>{{ slot.start }}-{{ slot.end }}</td>
              <td>{{ slot.capacity }}</td>
              <td>
                <span class="status" :class="store.slotRemainOf(cabinet.id, i) > 0 ? '' : 'status-full'">
                  {{ store.slotRemainOf(cabinet.id, i) > 0 ? `剩 ${store.slotRemainOf(cabinet.id, i)}` : "约满" }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  </section>
</template>
