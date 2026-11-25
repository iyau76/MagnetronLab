"""Freeze original scrambled Sobol emission_samples at T=1 K, rf=L=1 m.
Runtime scales xy by rf, z by L, velocities by sqrt(T). The source sampler is
unchanged. Particle IDs retain original Sobol coordinates; floating point
operation ordering can change the last few bits of scaled physical states.
"""
from pathlib import Path
import hashlib,json,sys,platform
ROOT=Path(__file__).resolve().parents[1]

def main():
    sys.path.insert(0,str(ROOT/'backend'/'physics'))
    import numpy as np
    import scipy
    from magnetron_model import CONFIG,emission_samples
    basis=emission_samples(32768,CONFIG['seed'],1.,1.,1.)
    destination=ROOT/'backend'/'physics'/'emission_basis.npy'
    np.save(destination,basis,allow_pickle=False)
    provenance={'generator':'scripts/generate_emission_basis.py',
        'source':'magnetron_model.emission_samples',
        'source_sha256':hashlib.sha256((ROOT/'backend'/'physics'/'magnetron_model.py').read_bytes()).hexdigest(),
        'seed':CONFIG['seed'],'count':32768,'temperature_K':1.,
        'filament_radius_m':1.,'tube_length_m':1.,
        'basis_sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),
        'shape':list(basis.shape),'dtype':str(basis.dtype),
        'python':platform.python_version(),'numpy':np.__version__,'scipy':scipy.__version__,
        'scaling':'xy *= filament_radius_m; z *= tube_length_m; velocity_xyz *= sqrt(temperature_K)',
        'roundoff':'Direct and scaled generation differ only by floating point operation ordering.'}
    destination.with_suffix('.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(provenance,indent=2))

if __name__=='__main__':main()
