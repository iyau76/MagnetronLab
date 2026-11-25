# 本地计算接口（HTTP / JSON）

服务默认绑定本机 `127.0.0.1`。`/api/defaults` 返回默认参数、线程预算和几何预设。主运行参数定义与范围校验见 `backend/settings.py`。`python run.py --api-only` 仅提供 JSON API；默认同时托管 `frontend/`，也可通过 `--web-root` 指定其他静态页面目录。

## 1. 扫场与单工作点计算

- `POST /api/scan` 或 `POST /api/point`：请求体可直接传入参数对象，或包裹为 `{"params": {...}}`。返回任务 `id`。
- `GET /api/job/{id}`：查询任务进度与计算结果。
- `POST /api/cancel/{id}`：取消正在运行的任务。已有扫描任务运行时仍可并发调用单粒子轨迹接口。

新提交的 `/api/scan` 或 `/api/point` 会自动取代正在运行或排队的旧任务，立即返回新 `id`，旧任务标记为 `cancelled` 并记录 `superseded_by`。

扫描由 `min(os.cpu_count() or 4, 6)` 个常驻工作进程逐点并行计算；`compute_threads` 控制单工作点的原生线程数。启用 `progressive: true` 时，先以 1024 粒子完成整条预览曲线写入 `preview_rows`，再补齐目标样本数。完整点可能乱序完成，每行附带原网格索引 `field_idx`。

**增量轮询**：`GET /api/job/{id}?since=0` 仅返回游标之后的新完成点 `rows` 与下一次游标 `next_cursor`。`since=0` 同时返回已生成的 `preview_rows`，后续轮询不重复传输。不带 `since` 时返回按磁场网格排好序的完整 `result.rows`。

主要请求参数：

| 参数 | 取值与说明 |
| :--- | :--- |
| `launch_mode` | `full`（三维热发射）、`axial`（仅轴向热初速）、`cold`（零初速） |
| `gradient` | 布尔值；是否保留线性灯丝电势梯度。关闭时有效加速电压自动减去 `filament_V / 2` |
| `emission_profile` | `uniform`（均匀发射）或 `cooled_ends`（端冷发射） |
| `end_cooling_eta` | `[0, 1]`；发射权重按 `1 - eta * (2 * z0 / L)^2` 归一化 |
| `progressive` | 布尔值；是否先输出 1024 粒子快速预览再补齐目标样本 |
| `fields_mT` | 可选，2 至 128 个严格单调的自定义磁场点（升序或降序） |
| `compute_threads` | 本机线程数，最多 16 且为系统保留至少一个逻辑线程 |
| `accuracy` | `statistical`（默认，倾角 `rtol=1e-7`）或 `reference`（`rtol=1e-9`）；单轨迹固定 `1e-9` |

每行输出包含 `field_mT, A1_uA, A2_uA, sum_uA, A2_H_uA, A2_K_uA, counts, fractions, region_counts`。`region_counts` 按 `[H 侧保护环, 中央阳极, K 侧保护环]` 排列。

`outcome` 分类代码（`counts` 与 `fractions` 固定 6 项）：
- `0`：返回灯丝阴极
- `1`：中央阳极收集
- `2`：两侧保护环合计收集
- `3`：轴向离开收集域
- `4`：达到最大飞行时间（默认 `2 μs`）仍在飞行
- `5`：零倾角初态由能量与正则角动量守恒解析判定不可达阳极（保留发射权重，不计入收集电流）

## 2. 单粒子轨迹与伴随批量轨迹

`POST /api/trace` 接受 `params` 与 `particle_id`（`0..32767`），或显式传入 `initial_state: [x, y, z, vx, vy, vz]`（SI 单位 `m` 与 `m/s`）。`include_zero_field` 默认为 `true`，同时返回同初态零场对照。

- 返回字段：`outcome, region, flight_ns, accepted_steps, initial_state, launch_state, points, radial_bounces, perigee, radial_work_eV, axial_work_eV, max_energy_residual_eV`。
- `points` 每行为 `[x_mm, y_mm, z_mm, r_mm, time_ns]`。
- 可选 `series: ["pphi"]` 返回与 `points` 等长的单位质量正则角动量序列 `pphi_mm2_per_ns` 及参考尺度 `pphi_hull_scale_mm2_per_ns`。
- **局域等势反事实对照**：传入 `gradient: false, anode_V: U_loc, filament_V: 0.0` 并复用原 `initial_state`，可避免关闭梯度时再扣去半个灯丝压降。
- **批量伴随轨迹**：传入 `particle_ids: [42, 3415, ...]`（最多 12 个）可单次返回 `{traces: [...]}`，用于扫场同步动画。

## 3. 全粒子分配与端冷重权

`POST /api/particles` 返回所有样本的初态与落点表（`particle_id, z0_mm, z_hit_mm, outcome, flight_ns`）、3×4 区域转移矩阵 `transfer_counts`，以及 `emission_moments`（每类样本数 $n$ 与 $q_{\text{sum}} = \sum (2z_0/L)^2$）。前端拖动端冷滑块 $\eta$ 时可直接用 $(n - \eta q_{\text{sum}})/(N - \eta Q_{\text{total}})$ 实时重权，无需重复积分。

## 4. 有限开口边缘场接口

`POST /api/edge/point` 与 `POST /api/edge/scan` 使用相同的任务 ID、增量查询与取消协议，新请求可跨普通解析势与边缘场模式互相取代。计算由 `backend/physics/edge_field.py`（SciPy 稀疏 Laplace 求解器）与 `backend/physics/edge_native/edge_core` 原生库完成，缓存独立驻留内存，不写入主磁盘终态缓存。

除常规物理参数外增加 `edge_boundary` 字段：
- `open`：开放管口（默认）
- `flange`：两端内收至 `4.05 mm` 翻边对照
- `seam`：电极接缝处 `0.5 mm` 窄缝对照
- `kill`：保留有限场但在原管口 $|z|=17.5\text{ mm}$ 终止轨迹的对照

当前边缘场接口固定采用标准管芯几何（`filament_radius_um=37.5, anode_radius_mm=4.55, length_mm=35, central_mm=15`），修改上述四项几何参数将返回 `400`。

请求示例：

```json
{
  "anode_V": 10,
  "filament_V": 3.68,
  "temperature_K": 2000,
  "tilt_deg": 7,
  "field_mT": 4.5,
  "particles": 1024,
  "emission_profile": "cooled_ends",
  "end_cooling_eta": 0.76,
  "edge_boundary": "open"
}
```
