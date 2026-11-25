"""Finals service/API additions: cooling, previews, launch identity, trace validation."""
import os,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'backend'/'physics'),str(ROOT/'backend')]
import numpy as np
import service
from settings import parameters,thread_budget
from terminal_cache import TerminalCache

class FinalsAPI(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory()
        self.previous=service.CACHE
        service.CACHE=TerminalCache(self.temporary.name)
    def tearDown(self):
        service.CACHE.close();service.CACHE=self.previous;self.temporary.cleanup()
    def test_cooling_and_progressive(self):
        p=parameters({'particles':4096,'fields_mT':[0.,3.,5.],'progressive':True})
        events=[];result=service.execute('scan',p,events.append)
        previews=[event['preview_rows'] for event in events if 'preview_rows' in event]
        self.assertEqual(len(previews),1)
        self.assertEqual(len(previews[0]),3)
        self.assertTrue(all(sum(row['counts'])==1024 for row in previews[0]))
        self.assertEqual(result['stats']['integrated_particles'],3*4096)
        cooled=service.execute('scan',dict(p,progressive=False,emission_profile='cooled_ends',end_cooling_eta=.8))
        self.assertEqual(cooled['stats']['integrated_particles'],0)
        for a,b in zip(result['rows'],cooled['rows']):
            self.assertEqual(a['counts'],b['counts'])
            self.assertEqual(sum(b['region_counts']),b['counts'][1]+b['counts'][2])
            self.assertAlmostEqual(b['A2_H_uA']+b['A2_K_uA'],b['A2_uA'])
        self.assertNotIn('fields_mT',result['params'])
    def test_launch_identity_and_budget(self):
        p=parameters({})
        self.assertLessEqual(thread_budget(100),16)
        self.assertEqual(len({service.physical_key(dict(p,launch_mode=mode),4) for mode in ('full','axial','cold')}),3)
        self.assertEqual(service.physical_key(p,4),service.physical_key(dict(p,emission_profile='cooled_ends',end_cooling_eta=1),4))

    def test_accuracy_separates_cache_and_preserves_trace(self):
        p=parameters({'particles':1024,'tilt_deg':10,'field_mT':4.48,'fields_mT':[4.48,5.]})
        fine=dict(p,accuracy='reference')
        ordinary=service.execute('scan',p)
        precise=service.execute('scan',fine)
        self.assertEqual(ordinary['numerics']['current_rtol'],1e-7)
        self.assertEqual(precise['numerics']['current_rtol'],1e-9)
        self.assertEqual(precise['stats']['cache_hits'],0)
        self.assertEqual(precise['stats']['integrated_particles'],2048)
        repeated=service.execute('scan',p)
        self.assertEqual(repeated['stats']['integrated_particles'],0)
        a=service.trace(p,1731,include_zero_field=False)
        b=service.trace(fine,1731,include_zero_field=False)
        self.assertEqual(a['points'],b['points'])
        self.assertEqual(a['outcome'],b['outcome'])
        self.assertLess(a['max_energy_residual_eV'],1e-4)
        with self.assertRaises(ValueError):parameters({'accuracy':'unknown'})
    def test_http_trace_while_scan_active(self):
        import json,threading,urllib.request,urllib.error
        import server
        from http.server import ThreadingHTTPServer
        http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        previous_active=server.ACTIVE;server.ACTIVE='existing-scan'
        worker=threading.Thread(target=http.serve_forever,daemon=True);worker.start()
        try:
            base=f'http://127.0.0.1:{http.server_port}'
            def post(body):
                request=urllib.request.Request(base+'/api/trace',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
                return urllib.request.urlopen(request,timeout=10)
            with post({'particle_id':0,'include_zero_field':False}) as response:
                self.assertEqual(response.status,200)
                self.assertIn('points',json.load(response))
            self.assertEqual(server.ACTIVE,'existing-scan')
            with self.assertRaises(urllib.error.HTTPError) as error:post({'particle_id':-1})
            self.assertEqual(error.exception.code,400)
            with urllib.request.urlopen(base+'/api/defaults') as response:
                self.assertIn('specimen_35mm_20261107',json.load(response)['geometry_presets'])
            with urllib.request.urlopen(base+'/api/health') as response:
                health=json.load(response)
                self.assertEqual(health['application_id'],'magnetron-lab-finals-native')
                self.assertEqual(Path(health['instance_path']),ROOT/'backend')
        finally:
            server.ACTIVE=previous_active;http.shutdown();http.server_close();worker.join()

    def test_trace_validation_and_surface(self):
        p=parameters({});c,_=service.config_for(p)
        result=service.trace(p,0,include_zero_field=True)
        self.assertIn('zero_field',result)
        self.assertEqual(len(result['initial_state']),6)
        self.assertEqual(len(result['launch_state']['state_SI']),6)
        self.assertTrue(all(len(point)==5 for point in result['points']))
        for kwargs in ({'particle_id':-1},{'particle_id':1.5},{'include_zero_field':'true'},
                       {'initial_state':[float('nan')]*6},{'initial_state':[0]*6},
                       {'initial_state':[c['anode_radius_m']*1.01,0,0,0,0,0]}):
            with self.subTest(kwargs=kwargs),self.assertRaises(ValueError):service.trace(p,**kwargs)
        # Physical launch surface is legal; inward velocity terminates at time zero.
        surface=[c['filament_radius_m'],0,0,-1e5,0,0]
        hit=service.trace(p,initial_state=surface,include_zero_field=False)
        self.assertEqual(hit['outcome'],0)

if __name__=='__main__':unittest.main()
