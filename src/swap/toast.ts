import { reactive } from "vue";

// 跨组件的轻提示，替代 alert
export const toast = reactive({
  visible: false,
  text: "",
  kind: "ok" as "ok" | "err",
  timer: 0 as ReturnType<typeof setTimeout>
});

export function showToast(text: string, kind: "ok" | "err" = "ok") {
  toast.text = text;
  toast.kind = kind;
  toast.visible = true;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (toast.visible = false), 3600);
}
