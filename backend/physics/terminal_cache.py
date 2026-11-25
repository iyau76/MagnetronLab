"""Thread-safe prefix cache with a bounded, coalescing disk writer."""
from pathlib import Path
from collections import OrderedDict
from threading import Condition, Thread
import numpy as np


class TerminalCache:
    def __init__(self, directory, memory_mb=32, disk_mb=128, max_entries=512,
                 queue_size=64):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.memory_limit = memory_mb * 1024**2
        self.disk_limit = disk_mb * 1024**2
        self.memory = OrderedDict()
        self.bytes = 0
        self.max_entries = max_entries
        self._condition = Condition()
        self._pending = OrderedDict()
        self._active = None
        self._error = None
        self._closed = False
        self._queue_size = max(1, int(queue_size))
        self._writes = 0
        self._skipped = 0
        files = [(path, path.stat()) for path in self.directory.glob('*.npy')]
        files.sort(key=lambda item: item[1].st_mtime)
        self.disk = OrderedDict((p.stem, st.st_size) for p, st in files)
        self.disk_bytes = sum(self.disk.values())
        self.trim_disk()
        self._writer = Thread(target=self._write_loop, name='terminal-cache-writer', daemon=True)
        self._writer.start()

    def _check_error(self):
        if self._error is not None:
            raise RuntimeError('Terminal cache disk writer failed') from self._error

    def trim_disk(self):
        with self._condition:
            while self.disk and (self.disk_bytes > self.disk_limit or
                                 len(self.disk) > self.max_entries):
                key, size = next(iter(self.disk.items()))
                (self.directory / (key + '.npy')).unlink(missing_ok=True)
                self.disk.pop(key)
                self.disk_bytes -= size

    def remember(self, key, value):
        with self._condition:
            previous = self.memory.pop(key, None)
            if previous is not None:
                self.bytes -= previous.nbytes
            self.memory[key] = value
            self.bytes += value.nbytes
            while self.memory and self.bytes > self.memory_limit:
                _, old = self.memory.popitem(last=False)
                self.bytes -= old.nbytes

    def get(self, key):
        with self._condition:
            if key in self.disk:
                self.disk.move_to_end(key)
            if key in self.memory:
                self.memory.move_to_end(key)
                return self.memory[key], 'memory'
            # Pending values stay readable even when larger than the memory LRU.
            if key in self._pending:
                return self._pending[key], 'memory'
            if self._active is not None and self._active[0] == key:
                return self._active[1], 'memory'
            if key in self.disk:
                value = np.load(self.directory / (key + '.npy'), allow_pickle=False)
                self.remember(key, value)
                return value, 'disk'
            return None, 'miss'

    def put(self, key, value, persist=True):
        # Snapshot ownership prevents caller mutation racing asynchronous np.save.
        snapshot = np.array(value, copy=True)
        snapshot.flags.writeable = False
        with self._condition:
            if self._closed:
                raise RuntimeError('Terminal cache is closed')
            self.remember(key, snapshot)
            if not persist or self._error is not None:
                return
            # Persistence is an optional cache, never backpressure on physics.
            # A full queue may omit an older disk entry; its in-memory prefix
            # remains subject to the ordinary bounded LRU policy.
            if key not in self._pending and len(self._pending) >= self._queue_size:
                self._pending.popitem(last=False)
                self._skipped += 1
            self._pending[key] = snapshot
            self._condition.notify_all()

    def status(self):
        with self._condition:
            return {'pending_writes':len(self._pending)+(self._active is not None),
                    'completed_writes':self._writes,'omitted_writes':self._skipped,
                    'disk_error':None if self._error is None else str(self._error)}

    def _write_loop(self):
        while True:
            with self._condition:
                while not self._pending and not self._closed:
                    self._condition.wait()
                if not self._pending:
                    return
                self._active = self._pending.popitem(last=False)
                key, value = self._active
                self._condition.notify_all()
            temporary = self.directory / (key + '.tmp')
            target = self.directory / (key + '.npy')
            try:
                with temporary.open('wb') as handle:
                    np.save(handle, value, allow_pickle=False)
                # Serialize rename/index/eviction with disk reads.
                with self._condition:
                    temporary.replace(target)
                    size = target.stat().st_size
                    self.disk_bytes -= self.disk.pop(key, 0)
                    self.disk[key] = size
                    self.disk_bytes += size
                    self._writes += 1
                    self.trim_disk()
            except Exception as error:
                with self._condition:
                    self._error = error
                    self._pending.clear()
                    self._active = None
                    self._condition.notify_all()
                return
            with self._condition:
                self._active = None
                self._condition.notify_all()

    def flush(self):
        """Wait until accepted writes are persisted; report any writer failure."""
        with self._condition:
            while self._pending or self._active is not None:
                self._check_error()
                self._condition.wait()
            self._check_error()

    def close(self):
        """Drain writes and stop the daemon. Idempotent after successful closure."""
        with self._condition:
            self._closed = True
            self._condition.notify_all()
        self.flush()
        self._writer.join()
