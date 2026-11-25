# 前端目录说明

- `index.html`：应用入口，加载 `chapter1/` 作为宿主管理启动页、三维实验台、14 页手账与本地存档。
- `chapter2/`：亥姆霍兹线圈 8×5 磁场标定交互。
- `chapter3/`：实测双通道扫场、六种截止判据与比荷数据处理。
- `chapters/`：第四至六幕非理想机制探究、自由探索沙盘、14 页手账与自包含 HTML 实验报告导出。
- `modules/ideal-physics.js`：第一幕零初速理想同轴模型独立数值模块（`r_f = 37.5 μm`, `r_a = 4.55 mm`）。
- `assets/`：压缩优化后的三维实验台 `bench_optimized.glb`、实测数据 `measurements.json` 以及 `precomputed/` 预计算轨迹包。
- `node_modules/three/`：仅保留当前前端实际导入的离线 Three.js ES 模块（2.14 MB），克隆仓库后无需执行 `npm install`。
- `licenses/`：随包分发的第三方开源组件许可全文。

前端数学单元测试：`node --test tests/frontend/*.test.mjs`（在仓库根目录运行）。
