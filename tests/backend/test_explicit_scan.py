"""Explicit field-grid scan acceptance.

Run: python tests/backend/test_explicit_scan.py
No HTTP service is contacted; caches are isolated in a temporary directory.
Verifies that an explicit fields_mT grid returns exactly those fields, matches
the built-in grid physics point-for-point at shared fields, keeps the params
payload clean for CSV export, and rejects malformed grids.
"""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    with tempfile.TemporaryDirectory(prefix="magnetron_explicit_") as temporary:
        os.environ["MAGNETRON_DATA_DIR"] = temporary
        os.environ["NUMBA_CACHE_DIR"] = temporary
        sys.dont_write_bytecode = True
        sys.path[:0] = [str(ROOT / "backend" / "physics"), str(ROOT/'backend')]
        import service
        from settings import DEFAULT, parameters
        from terminal_cache import TerminalCache

        service.CACHE = TerminalCache(Path(temporary) / "cache")
        try:
            service.warm()

            fields = [0.0, 1.0, 2.0, 3.0]
            params = parameters(dict(DEFAULT, particles=1024, compute_threads=1, fields_mT=fields))
            assert params["fields_mT"] == fields
            result = service.execute("scan", params)
            assert [row["field_mT"] for row in result["rows"]] == fields
            assert result["requested_fields_mT"] == fields
            assert result["completed_fields"] == 4
            assert not result["cancelled"]
            assert "fields_mT" not in result["params"], "params 不携带网格，避免破坏 CSV 导出列对齐"
            for row in result["rows"]:
                assert sum(row["counts"]) == 1024

            # Same physics as the built-in grid at shared field values.
            grid_params = parameters(dict(DEFAULT, particles=1024, compute_threads=1, field_max_mT=4.0))
            grid_result = service.execute("scan", grid_params)
            by_field = {round(row["field_mT"], 6): row for row in grid_result["rows"]}
            shared = 0
            for row in result["rows"]:
                key = round(row["field_mT"], 6)
                if key in by_field:
                    assert by_field[key]["counts"] == row["counts"]
                    shared += 1
            assert shared == 4, f"与内置网格应有 4 个共同点，实际 {shared}"

            # A descending grid (reverse sweep) stays one job and returns in order.
            down = parameters(dict(DEFAULT, particles=1024, compute_threads=1, fields_mT=[3.0, 2.0, 1.0]))
            down_result = service.execute("scan", down)
            assert [row["field_mT"] for row in down_result["rows"]] == [3.0, 2.0, 1.0]

            # Malformed grids are rejected by the HTTP-side schema.
            for bad in ([5.0], [0.0, 0.0, 1.0], [0.5, 0.3, 0.4], [0.0, 9.0], [0.0, "x", 2.0], 3.5, list(range(130))):
                try:
                    parameters(dict(DEFAULT, fields_mT=bad))
                except ValueError:
                    continue
                raise AssertionError(f"应拒绝 fields_mT={bad!r}")

            # Default behaviour unchanged when no grid is supplied.
            plain = parameters(dict(DEFAULT))
            assert plain["fields_mT"] is None
            assert len(service.grid(plain)) == 42
        finally:
            service.CACHE.close();service.CACHE=None

    print("explicit scan checks passed", flush=True)


if __name__ == "__main__":
    main()
