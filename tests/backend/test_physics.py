"""Current-geometry physics regressions: exact motion, strict boundaries and refinement."""
from pathlib import Path
import sys
import unittest
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'backend'/'physics'),str(ROOT/'backend')]
import fast_kernel as kernel
import service
from settings import parameters

class PhysicsTests(unittest.TestCase):
    def test_uniform_field_exact_helix(self):
        p=parameters({})
        c,_=service.config_for(p)
        c=c|{'filament_voltage_V':0.,'max_flight_time_s':35e-9,'rtol':1e-10}
        initial=np.array([.002,0,0,2e5,0,0.])
        for angle in (0,10):
            terminal,data=kernel._trace(initial,0,.01,angle,c)
            direction=np.array([np.sin(np.deg2rad(angle)),0,np.cos(np.deg2rad(angle))])
            omega=.1758820010772163*10
            velocity=initial[3:]*1e-6
            parallel=direction*np.dot(direction,velocity)
            perp=velocity-parallel
            t=data[:,0]
            exact=initial[:3]*1000+np.outer(t,parallel)+np.outer(np.sin(omega*t)/omega,perp)+np.outer((1-np.cos(omega*t))/omega,np.cross(direction,velocity))
            self.assertLess(float(np.max(np.linalg.norm(data[:,1:4]-exact,axis=1))),1e-6)

    def test_boundary_energy_and_canonical_momentum(self):
        for angle in (0,10):
            p=parameters({'tilt_deg':angle,'accuracy':'reference'})
            c,voltage=service.config_for(p)
            states=service.source_states(p['temperature_K'],c['filament_radius_m'],c['tube_length_m'])
            for field in (0.,4.48,5.96):
                for ident in (0,1731,6142):
                    terminal,data=kernel._trace(states[ident],voltage,field*.001,angle,c)
                    diag=kernel.trace_diagnostics(data,voltage,c)
                    self.assertLess(diag['max_energy_residual_eV'],1e-4)
                    radius=np.hypot(data[:,1],data[:,2])
                    self.assertLessEqual(float(radius.max()),c['anode_radius_m']*1000+1e-7)
                    self.assertLessEqual(float(np.abs(data[:,3]).max()),c['tube_length_m']*500+1e-7)
                    if terminal[0] in (0,1):
                        expected=c['filament_radius_m'] if terminal[0]==0 else c['anode_radius_m']
                        self.assertLess(abs(radius[-1]-expected*1000),1e-7)
                    if terminal[0]==3:self.assertLess(abs(abs(data[-1,3])-c['tube_length_m']*500),1e-7)
                    if terminal[0]==4:self.assertAlmostEqual(terminal[1],c['max_flight_time_s'],places=15)
                    if angle==0:
                        angular=data[:,1]*data[:,5]-data[:,2]*data[:,4]-.5*.1758820010772163*field*radius**2
                        self.assertLess(float(np.max(abs(angular-angular[0]))),1e-5)

    def test_tolerance_refinement_and_strict_exclusion(self):
        for angle in (0,10):
            p=parameters({'tilt_deg':angle,'accuracy':'reference'})
            c,voltage=service.config_for(p)
            states=service.source_states(p['temperature_K'],c['filament_radius_m'],c['tube_length_m'])[:1024]
            for field in (4.48,5.96):
                a=kernel.run_terminal(states,voltage,field*.001,angle,c,threads=1)
                b=kernel.run_terminal(states,voltage,field*.001,angle,c|{'rtol':1e-10},threads=1)
                self.assertEqual(len(a),1024)
                different=np.count_nonzero(kernel.classify(a,c['central_collector_length_m'])!=kernel.classify(b,c['central_collector_length_m']))
                self.assertLessEqual(different,5)
                # Code 5 is an exact zero-tilt exclusion, not a simulated 2-us endpoint.
                for ident in np.flatnonzero(a[:,0]==5)[:3]:
                    term,data=kernel._trace(states[ident],voltage,field*.001,angle,c|{'rtol':1e-10})
                    self.assertNotEqual(int(term[0]),1)

if __name__=='__main__':unittest.main()
