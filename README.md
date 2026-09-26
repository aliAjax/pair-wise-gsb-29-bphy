# 换电排程台

- 行业：物流
- 技术栈：Vue3、Vite、TypeScript
- 启动：`npm install && npm run dev`
- 构建：`npm run build`

配送页的换电排程版本：车辆记余电、每公里耗电和班次，换电柜记可约时段，订单记距离、承诺时段和温区。
派单时计入绕路耗电，换电后按满电接单；余电不够、温区不符或柜位约满时，订单留在待处理并写明缺多少公里。
取消班次或换车会释放换电预约，重开页面仍可看到排程和原因。

## 目录结构（资料、判断、保存分开）

- `src/domain/data.ts` — 资料：类型定义与种子数据（车辆 / 换电柜 / 订单）
- `src/domain/dispatch.ts` — 判断：派单、换电预约、取消班次、换车等纯领域逻辑
- `src/domain/storage.ts` — 保存：localStorage 读写
- `src/App.vue` — 视图：排程台界面与操作入口
