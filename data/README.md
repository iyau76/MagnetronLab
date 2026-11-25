# 公开实测数据集（`data/`）

这里存放的是我们在 2026 年 9 月返场补测与 11 月几何重建中整理出的完整结构化实验数据。数据采集自高校物理实验中心同一套真空二极管磁控台架，既驱动了软件第二、三、六幕的实测对照曲线，也全部导出为标准 CSV 与 JSON 文件（采用 **CC BY 4.0** 协议共享），方便你直接用 Python、MATLAB、Origin 或 Excel 做独立检验。

---

## 一、这批数据是怎么测出来的？

在常规课程实验里，学生通常只在中央测量阳极（$A_1$）回路串入一只取样电阻测电流，而把两侧保护环（$A_2$）直接连到加速电源正极上。为了弄清截止前电流反常抬升究竟是“灯丝总发射增强”还是“电子在电极间重新分配落点”，我们在返场补测中做了三件事：

1. **空载五孔位霍尔磁场标定（`calibration_8x5.csv`）**：在未装入电子管的空载状态下，将特斯拉计霍尔探头依次伸入管区透明有机玻璃定位板的中心与四角共 5 个标准孔位，在 $0.20\text{--}1.40\text{ A}$（及扩展至 $4.0\text{ A}$ 的线性度核对）共 8 档励磁电流下读取磁感应强度，取五孔空间均值建立励磁电流—磁场标定关系。
2. **双通道同步磁截止扫场（`magnetic_scan_4_6_8_10V.csv`）**：将中央阳极 $A_1$ 与两侧合并保护环 $A_2$ 分别串联 $1\text{ k}\Omega$ 精密取样电阻，接入两块数字毫伏表（$1\text{ mV}$ 对应 $1\ \mu\text{A}$），同时用第三通道监测直热式钨丝两端的实时直流加热电压 $U_f$（约 $3.68\text{ V}$）。在 $U_a = 4, 6, 8, 10\text{ V}$ 四档加速电压下，以 $20\text{ mA}$ 励磁步长完成 0 至 $1.40\text{ A}$（每档正扫 71 点，含正反扫与零场基线共 594 条记录）的完整扫场。
3. **高场加速电压反扫（`voltage_scan_high_field.csv`）**：固定高励磁电流，改变加速电压采集的 286 条辅助对照记录。

---

## 二、文件清单与标定关系

| 文件名 | 行列规模 | 内容说明 |
| :--- | :--- | :--- |
| [`calibration_8x5.csv`](calibration_8x5.csv) | 8 行 × 7 列 | 8 档励磁电流下定位板 5 个孔位的磁感应强度（`pos1_mT`–`pos5_mT`）及五孔空间均值 `mean_mT` |
| [`magnetic_scan_4_6_8_10V.csv`](magnetic_scan_4_6_8_10V.csv) | 594 行 × 30 列 | $4, 6, 8, 10\text{ V}$ 四档电压下中央阳极 $I_{\mathrm{A1}}$ 与保护环 $I_{\mathrm{A2}}$ 双通道扫场完整记录 |
| [`voltage_scan_high_field.csv`](voltage_scan_high_field.csv) | 286 行 × 30 列 | 固定高磁场条件下的加速电压扫描记录 |
| [`geometry_spec.json`](geometry_spec.json) | JSON 元数据 | 经参数卡与带标尺微距照片透视重建确认的三段式管芯几何（`10 + 15 + 10 mm`，钨丝半径 `37.5 μm`，阳极内半径 `4.55 mm`）与标定系数 |

**空载五孔空间均值最小二乘标定公式**：

$$B\,(\text{mT}) = 4.230907 \times I_M\,(\text{A}) - 0.188067, \qquad R^2 = 0.999869$$

---

## 三、核心字段字典（`magnetic_scan_4_6_8_10V.csv`）

| 字段名 | 单位 | 物理含义与使用提示 |
| :--- | :---: | :--- |
| `run_id` | — | 实验轮次唯一标识（标准正扫四档为 `4V/9588`、`6V/8764`、`8V/3847`、`10V/0114`） |
| `record_role` / `direction` | — | 记录阶段（如扫场前零场 `zero_before`、正式扫场 `sweep`）与扫场方向（`forward` / `reverse`） |
| `nominal_voltage_V` | $\text{V}$ | 标称加速电压档位（`4`, `6`, `8`, `10`） |
| `accelerating_actual_V` | $\text{V}$ | 电源实测加速电压读数 $U_a$（**未预扣灯丝压降**） |
| `excitation_actual_A` | $\text{A}$ | 亥姆霍兹线圈实测励磁电流 $I_M$ |
| `CH3_voltage_V` / `CH3_current_A` | $\text{V}$ / $\text{A}$ | 直热式钨丝两端实测加热电压 $U_f$（约 $3.68\text{ V}$）与加热电流（约 $0.36\text{ A}$） |
| `physical_A1_current_uA` | $\mu\text{A}$ | **中央阳极 $A_1$ 收集电流 $I_{\mathrm{A1}}$**（$1\text{ k}\Omega$ 取样电阻压降换算） |
| `physical_A2_current_uA` | $\mu\text{A}$ | **两侧保护环合并支路 $A_2$ 收集电流 $I_{\mathrm{A2}}$** |
| `physical_sum_current_uA` | $\mu\text{A}$ | 两路收集总电流 $I_{\mathrm{A1}} + I_{\mathrm{A2}}$ |
| `is_forward_cutoff_fit_point` | `bool` | 是否属于满足励磁跟随精度（$|I_{\text{actual}} - I_{\text{set}}| < 5\text{ mA}$）且严格递增的标准正扫点（每档 71 点，筛选此列为 `True` 即可直接复现设计报告第五章的全部曲线） |
