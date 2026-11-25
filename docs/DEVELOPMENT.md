# 开发、编译与测试说明

## 1. 模块边界

- `backend/server.py`：本地 HTTP 服务、独立计算进程池、增量查询与取消控制。
- `backend/settings.py`：几何默认值、参数范围校验与缓存键规范。
- `backend/physics/service.py`：初态基底加载、求解器调度、H/中央/K 三区统计与终态缓存。
- `backend/physics/native/magnetron_core.cpp`：同轴与倾角粒子追踪 C++17 `DOPRI5(4)` 内核。
- `backend/physics/edge_field.py` 与 `backend/physics/edge_native/edge_core.cpp`：有限开口 Laplace 电势求解与边缘场内核（缓存独立于主引擎）。
- `frontend/modules/ideal-physics.js`：第一幕理想冷电子教学数值模块，与后端五层模型独立测试。
- `frontend/node_modules/three/`：精简后的离线 Three.js ES 模块（2.14 MB），无需 `npm install` 即可直接运行前端。

后端支持无前端独立运行：`python run.py --api-only` 仅暴露 `/api/*`；`python run.py --web-root <dir>` 可挂载自定义静态页面。

## 2. 编译原生 C++17 内核

Windows x64 已随仓库附带预编译的 `backend/physics/magnetron_core.dll` 与 `backend/physics/edge_native/edge_core.dll`。修改 C++ 源码或在 Linux / macOS 上运行时请重新编译：

### Linux / macOS

需要支持 C++17 的 `g++` 或 `clang++`：

```bash
bash backend/physics/native/build_unix.sh
bash backend/physics/edge_native/build_unix.sh
```

脚本会在对应目录生成 `.so`（Linux）或 `.dylib`（macOS），`fast_kernel.py` 与 `edge_field.py` 会按平台自动加载。

### Windows（重新编译 DLL）

使用 MSVC（Visual Studio Build Tools）或 MinGW-w64：

```powershell
powershell -ExecutionPolicy Bypass -File backend/physics/native/build_native.ps1
```

## 3. 自动化回归测试

以下命令均在仓库根目录执行。运行前端 `.test.mjs` 测试需要本机 `PATH` 中有 Node.js（18+）。

### 标准全量回归（后端物理 + 边缘场 + 实测数据完整性 + HTTP 启动 + 前端数学）

```bash
python tests/run_regression.py
```

若本机未安装 Node.js，可单独运行 Python 后端与服务测试：

```bash
python -m unittest discover -s tests/backend -p "test_*.py" -v
python tests/backend/test_explicit_scan.py
python tests/backend/test_partial_scan.py
python -m unittest discover -s tests/integration -p "test_server_startup.py" -v
```

### 数值资产与误差预算核验

```bash
python scripts/verify_ch456_assets.py
python scripts/verify_error_budget.py
```

### 浏览器端到端检查（可选，需要 Playwright 与 Chromium/Edge）

先启动本地服务（默认 `8894` 端口），再按需运行对应章节检查：

```bash
python run.py --port 8894
python tests/integration/test_chapter1.py --base-url http://127.0.0.1:8894/
python tests/integration/test_chapter2.py --url http://127.0.0.1:8894/
python tests/integration/test_chapter3.py --url http://127.0.0.1:8894/
python tests/integration/test_six_chapters.py --width 1280 --height 800
```

所有运行期终态缓存与测试截图均默认写入 `results/`（已被 `.gitignore` 忽略）。可通过环境变量 `MAGNETRON_DATA_DIR` 指定缓存目录。

## 4. 构建 Windows 免安装离线发布包

在 Windows 上可使用 `packaging/` 中的脚本，通过独立虚拟环境与 PyInstaller 打包免安装单目录发布包及校验清单：

```powershell
powershell -ExecutionPolicy Bypass -File packaging/构建离线发布包.ps1
```

构建完成后会在 `dist/` 生成 `MagnetronLab/` 目录、ZIP 压缩包与 `release-manifest.json`，并自动执行剥离开发环境后的端到端冒烟验证。
