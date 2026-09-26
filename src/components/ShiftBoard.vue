<script setup lang="ts">
import { computed } from "vue";
import { useSwapStore } from "../swap/store";
import { maxRangeKm, remainRangeKm, round2 } from "../swap/engine";

// 班次与车辆：车辆记余电、每公里耗电和班次；取消/重开班次在这里操作
const store = useSwapStore();

function batteryClass(v: { remainingKwh: number; capacityKwh: number }) {
  const pct = (v.remainingKwh / Math.max(v.capacityKwh, 0.01)) * 100;
  if (pct < 25) return "batt batt-low";
  if (pct < 55) return "batt batt-mid";
  return "batt";
}

const lowBatteryVehicles = computed(() =>
  store.vehicles.filter((v) => remainRangeKm(v) < 10)
);
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>班次与车辆</h2>
      <span class="hint">取消班次自动释放在途换电预约</span>
    </div>

    <div v-for="shift in store.shifts" :key="shift.id" class="shift-block">
      <div class="shift-head" :class="{ off: !shift.active }">
        <div>
          <strong>{{ shift.name }}</strong>
          <span class="tag tag-line">{{ shift.start }}-{{ shift.end }}</span>
          <span class="status" :class="shift.active ? '' : 'status-off'">
            {{ shift.active ? "出勤中" : "已取消" }}
          </span>
        </div>
        <button
          type="button"
          :class="shift.active ? 'danger' : 'secondary'"
          @click="store.toggleShift(shift.id)"
        >
          {{ shift.active ? "取消班次" : "重开班次" }}
        </button>
      </div>

      <div class="vehicle-list">
        <article v-for="v in store.vehiclesByShift.get(shift.id)" :key="v.id" class="vehicle-card">
          <div class="vehicle-main">
            <strong>{{ v.plate }}</strong>
            <span class="zone" :class="`zone-${v.zone}`">{{ v.zone }}厢</span>
          </div>
          <div class="battery-wrap">
            <div :class="batteryClass(v)">
              <div class="batt-fill" :style="{ width: `${Math.min(100, (v.remainingKwh / v.capacityKwh) * 100)}%` }" />
            </div>
            <span class="batt-text">{{ round2(v.remainingKwh) }}/{{ v.capacityKwh }}度</span>
          </div>
          <div class="vehicle-stats">
            <span>耗电 {{ v.kwhPerKm }}度/km</span>
            <span>余电可跑 {{ round2(remainRangeKm(v)) }}km</span>
            <span>满电可跑 {{ round2(maxRangeKm(v)) }}km</span>
          </div>
          <label class="inline-edit">
            手动充电/调整余电
            <span class="stepper">
              <input
                type="number"
                min="0"
                :max="v.capacityKwh"
                step="0.1"
                :value="v.remainingKwh"
                @change="(e) => store.updateRemaining(v.id, Number((e.target as HTMLInputElement).value))"
              />
              <button type="button" class="secondary mini" @click="store.updateRemaining(v.id, v.capacityKwh)">
                充满
              </button>
            </span>
          </label>
        </article>
        <p v-if="(store.vehiclesByShift.get(shift.id) ?? []).length === 0" class="empty-mini">
          该班次暂无车辆
        </p>
      </div>
    </div>

    <p v-if="lowBatteryVehicles.length" class="warn-line">
      ⚠ {{ lowBatteryVehicles.map((v) => v.plate).join("、") }} 余电低于 10km，建议先换电再派单
    </p>
  </section>
</template>
