# Repository Technical Conventions

## Geometry Convention
All physics calculations use the verified three-segment coaxial diode parameters:
- Filament diameter: `75 μm` (radius `a = 37.5 μm`)
- Anode inner diameter: `9.0–9.2 mm` (nominal inner radius `b = 4.55 mm`)
- Collector segments: `10 mm` guard ring (H side) + `15 mm` central anode (`A1`) + `10 mm` guard ring (K side), total collector length `35 mm`
- True physical filament anchor span and effective thermionic emission length are modeled separately from collector length and must not be conflated.

## Architecture Boundaries
- `backend/physics/native/magnetron_core.cpp` is the production coaxial/tilted C++17 DOPRI5(4) kernel.
- `backend/physics/edge_native/edge_core.cpp` + `backend/physics/edge_field.py` form the isolated finite open-shell Laplace experiment; keep its caches separate from the main terminal cache.
- `frontend/modules/ideal-physics.js` serves Chapter 1 ideal cold-electron teaching interactions independently from the backend multi-layer model.
- `frontend/assets/measurements.json` is the runtime experimental dataset; `data/` contains its exported CSV/JSON tables for external analysis.

## Verification Before Merging
Run the regression suite from the repository root:
```bash
python tests/run_regression.py
```
If modifying `frontend/assets/precomputed/` or numerical kernels, also run:
```bash
python scripts/verify_ch456_assets.py
python scripts/verify_error_budget.py
```
