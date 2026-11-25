"""Persistent, single-thread-per-field workers for the native batch ABI.

The existing DLL serializes batches in one process. Separate worker processes
give real point-level parallelism without changing the numerical kernel.
Only the parent owns the terminal cache and writes to disk.
"""
import atexit
import multiprocessing as mp
import os
import time
from concurrent.futures import ProcessPoolExecutor

WORKERS = min(os.cpu_count() or 4, 6)
_pool = None
_stop = None
_counts = None


def _initialize(stop, counts):
    global _stop, _counts
    _stop, _counts = stop, counts
    from fast_kernel import warm_native
    warm_native()


def integrate_field(index, states, voltage, field_T, tilt, config, offset):
    from fast_kernel import Cancelled, run_terminal
    begin = time.perf_counter()
    cancelled = False
    try:
        terminal = run_terminal(states, voltage, field_T, tilt, config, threads=1,
            cancel=_stop.is_set,
            progress=lambda done: _counts.__setitem__(index, offset + done))
    except Cancelled as error:
        terminal = error.terminal
        cancelled = True
    return terminal, time.perf_counter() - begin, cancelled


def acquire():
    global _pool, _stop, _counts
    if _pool is None:
        # Set before spawn so NumPy/BLAS startup cannot consume nested pools.
        for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
            os.environ[key] = '1'
        context = mp.get_context('spawn')
        _stop = context.Event()
        _counts = context.Array('i', 128, lock=False)
        _pool = ProcessPoolExecutor(max_workers=WORKERS, mp_context=context,
            initializer=_initialize, initargs=(_stop, _counts))
    _stop.clear()
    for i in range(128):
        _counts[i] = 0
    return _pool, _stop, _counts


def close():
    global _pool
    if _pool is not None:
        _stop.set()
        _pool.shutdown(wait=True, cancel_futures=True)
        _pool = None


atexit.register(close)
