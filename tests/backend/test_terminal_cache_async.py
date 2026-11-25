import tempfile
import unittest
from pathlib import Path
from threading import Event
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'backend'))
import numpy as np
from physics.terminal_cache import TerminalCache
import settings

class CacheTests(unittest.TestCase):
    def test_async_snapshot_coalescing_and_disk_prefix(self):
        with tempfile.TemporaryDirectory() as directory:
            cache=TerminalCache(directory, memory_mb=0, queue_size=2)
            entered,release=Event(),Event()
            original=np.save
            def slow_save(*args,**kwargs):
                entered.set()
                if not release.wait(5):raise TimeoutError('test writer blocked')
                return original(*args,**kwargs)
            try:
                with patch('physics.terminal_cache.np.save',side_effect=slow_save):
                    initial=np.ones((2,6));cache.put('prefix',initial)
                    self.assertTrue(entered.wait(2))
                    initial[:]=99
                    np.testing.assert_array_equal(cache.get('prefix')[0],np.ones((2,6)))
                    cache.put('prefix',np.ones((3,6))*2)
                    cache.put('prefix',np.ones((4,6))*3)
                    self.assertEqual(len(cache._pending),1)
                    self.assertEqual(len(cache.get('prefix')[0]),4)
                    release.set();cache.flush()
                reopened=TerminalCache(directory)
                try:
                    value,origin=reopened.get('prefix')
                    self.assertEqual(origin,'disk')
                    np.testing.assert_array_equal(value,np.ones((4,6))*3)
                finally:reopened.close()
            finally:
                release.set();cache.close()

    def test_failure_preserves_memory_and_is_reported_on_flush(self):
        with tempfile.TemporaryDirectory() as directory:
            cache=TerminalCache(directory)
            with patch('physics.terminal_cache.np.save',side_effect=OSError('disk unavailable')):
                cache.put('failure',np.zeros((1,6)))
                with self.assertRaises(RuntimeError):cache.flush()
            np.testing.assert_array_equal(cache.get('failure')[0],np.zeros((1,6)))
            self.assertIn('disk unavailable',cache.status()['disk_error'])
            cache.put('later',np.ones((2,6)))
            np.testing.assert_array_equal(cache.get('later')[0],np.ones((2,6)))
            with self.assertRaises(RuntimeError):cache.close()

    def test_preview_and_full_queue_never_wait_for_disk(self):
        with tempfile.TemporaryDirectory() as directory:
            cache=TerminalCache(directory,queue_size=1)
            entered,release=Event(),Event();original=np.save
            def blocked(*args,**kwargs):
                entered.set()
                if not release.wait(5):raise TimeoutError('writer not released')
                return original(*args,**kwargs)
            try:
                cache.put('preview',np.zeros((1,6)),persist=False)
                self.assertEqual(cache.status()['pending_writes'],0)
                with patch('physics.terminal_cache.np.save',side_effect=blocked):
                    cache.put('active',np.ones((1,6)));self.assertTrue(entered.wait(2))
                    cache.put('queued',np.ones((2,6)));cache.put('newest',np.ones((3,6)))
                    self.assertEqual(cache.status()['omitted_writes'],1)
                    self.assertEqual(len(cache.get('queued')[0]),2)
                    release.set();cache.flush()
            finally:release.set();cache.close()

    def test_parameter_contract(self):
        p=settings.parameters({})
        self.assertEqual((p['length_mm'],p['central_mm'],p['filament_radius_um']),(35,15,37.5))
        for raw in ({'gradient':'false'},{'progressive':1},{'launch_mode':'bad'},
                    {'emission_profile':'bad'},{'end_cooling_eta':1.01},{'particles':4096.5}):
            with self.subTest(raw=raw), self.assertRaises(ValueError):settings.parameters(raw)
        self.assertEqual(settings.parameters({'fields_mT':[4,2]})['fields_mT'],[4,2])

if __name__=='__main__':unittest.main()
