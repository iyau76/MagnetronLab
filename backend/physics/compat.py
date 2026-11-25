"""Optional JIT for reference execution; native production imports no compiler."""
import os
from pathlib import Path

_native_primary = (os.name == 'nt' and Path(__file__).with_name('magnetron_core.dll').is_file()
                   and os.environ.get('MAGNETRON_FORCE_PYTHON_KERNEL') != '1')
try:
    if _native_primary:
        raise ImportError('Native kernel is the primary execution path')
    from numba import njit, prange
except ImportError:
    def njit(function=None, **options):
        if function is not None:
            return function
        return lambda implementation: implementation

    prange = range
