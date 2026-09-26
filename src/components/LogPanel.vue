<script setup lang="ts">
import { useSwapStore } from "../swap/store";

// 排程日志：取消/重开、派单拦截、换电预约释放都落痕，刷新后仍可查
const store = useSwapStore();

const typeClass: Record<string, string> = {
  派单: "log-dispatch",
  释放: "log-release",
  完成: "log-done",
  取消班次: "log-off",
  重开班次: "log-on",
  换车: "log-release"
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>排程日志</h2>
      <span class="hint">最近 60 条，随资料一起保存在本地</span>
    </div>
    <div v-if="store.logs.length === 0" class="empty">暂无操作记录</div>
    <ul class="log-list">
      <li v-for="log in store.logs" :key="log.id">
        <span class="log-time">{{ fmt(log.time) }}</span>
        <span class="status" :class="typeClass[log.type] ?? ''">{{ log.type }}</span>
        <span class="log-msg">{{ log.message }}</span>
      </li>
    </ul>
  </section>
</template>
