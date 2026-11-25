"""Independent physical benchmarks for the reference trajectory model."""
import json
import os
from pathlib import Path

import numpy as np
from numba import set_num_threads
from scipy.constants import e, m_e, k

from magnetron_model import (CONFIG, DIRECTORY, cold_cutoff_T, emission_samples,
                             potential, derivatives, rk4_step, run_ensemble,
                             independent_slice_transmission)


def main():
    set_num_threads(6)
    config = dict(CONFIG)
    config.update(filament_voltage_V=0.0, tube_length_m=1.0, central_collector_length_m=1.0)
    radius = config["anode_radius_m"]
    filament = config["filament_radius_m"]
    voltage = 10.0
    critical = cold_cutoff_T(voltage, radius, filament)
    records = {}

    # A magnetic field must rotate, not heat, a free electron.
    field = 0.005
    state = np.array([0.002, 0., 0., 1e5, 0., 0.])
    initial = state.copy()
    step = 1e-11
    iterations = 2000
    for _ in range(iterations):
        state = rk4_step(state, step, 0., 0., filament, radius, 1., 0., field)
    omega = e * field / m_e
    phase = omega * step * iterations
    expected = np.array([initial[0] + initial[3] / omega * np.sin(phase),
                         initial[3] / omega * (1-np.cos(phase)), 0.,
                         initial[3] * np.cos(phase), initial[3] * np.sin(phase), 0.])
    records["pure_magnetic_rotation"] = {
        "relative_speed_error": float(abs(np.linalg.norm(state[3:]) / 1e5 - 1)),
        "position_error_m": float(np.linalg.norm(state[:3] - expected[:3]))}

    # Find the cold cutoff with the numerical trajectory, without using its
    # analytic value as a force or trajectory boundary.
    cold_state = np.array([[filament, 0., 0., 0., 0., 0.]])
    lower, upper = critical * 0.90, critical * 1.10
    for _ in range(19):
        middle = (lower + upper) / 2
        result, _ = run_ensemble(cold_state, voltage, middle, 0., config)
        if result[0] == 1:
            lower = middle
        else:
            upper = middle
    records["cold_cutoff"] = {"analytic_T": float(critical), "numerical_T": float((lower+upper)/2),
                               "relative_error": float(abs((lower+upper)/2/critical-1))}

    # Compare individual hot-electron outcomes to an independently calculated
    # finite-radius energy + canonical-angular-momentum criterion.
    states = emission_samples(512, CONFIG["seed"], 2000, filament, 1.)
    states[:, 2] = 0
    states[:, 5] = 0
    launch_tangential = (states[:, 0]*states[:, 4] - states[:, 1]*states[:, 3]) / filament
    mismatches = 0
    max_energy = 0
    max_momentum = 0
    still_flying = 0
    for fraction in (0.8, 0.99, 1.01, 1.05, 1.2):
        field = critical * fraction
        anode_tangential = filament / radius * launch_tangential + e*field*(radius**2-filament**2)/(2*m_e*radius)
        reaches_anode = 0.5*m_e*np.sum(states[:, 3:5]**2, axis=1) + e*voltage >= 0.5*m_e*anode_tangential**2
        outcomes, diagnostic = run_ensemble(states, voltage, field, 0, config, checks=True)
        mismatches += np.count_nonzero((outcomes == 1) != reaches_anode)
        still_flying += np.count_nonzero(outcomes == 4)
        max_energy = max(max_energy, diagnostic[:, 1].max())
        max_momentum = max(max_momentum, diagnostic[:, 2].max())
    records["hot_electron_invariants"] = {
        "trajectory_count": 2560, "outcome_mismatches": int(mismatches),
        "still_flying": int(still_flying), "max_scaled_energy_error": float(max_energy),
        "max_scaled_canonical_momentum_error": float(max_momentum)}

    # Finite differences check E=-grad(phi) and Laplace(phi)=0 for the
    # manufactured finite-cylinder field, including its axial component.
    state = np.array([0.0012, 0.0008, 0.002, 0., 0., 0.])
    length = 0.02
    args = (10., CONFIG["filament_voltage_V"], filament, radius, length)
    h = 1e-6
    gradient = np.zeros(3)
    laplacian = 0.
    center = potential(state, *args)
    for dimension in range(3):
        plus = state.copy(); plus[dimension] += h
        minus = state.copy(); minus[dimension] -= h
        gradient[dimension] = (potential(plus,*args)-potential(minus,*args))/(2*h)
        laplacian += (potential(plus,*args)-2*center+potential(minus,*args))/h**2
    acceleration = derivatives(state,*args,0.,0.)[3:]
    expected_acceleration = e/m_e*gradient
    records["vacuum_field"] = {
        "relative_gradient_error": float(np.linalg.norm(acceleration-expected_acceleration)/np.linalg.norm(expected_acceleration)),
        "scaled_laplace_residual": float(abs(laplacian) / (10/np.hypot(state[0],state[1])**2))}

    # The finite-length/tilt sensitivity result must survive smaller steps.
    states = emission_samples(512, CONFIG["seed"], 2000, filament, CONFIG["tube_length_m"])
    fine = dict(CONFIG)
    fine["max_step_s"] /= 2
    fine["relative_step_scale"] /= 2
    changed = 0
    largest_fraction_change = 0.
    for field in (0.0038, 0.0044, 0.005, 0.006):
        coarse_out, _ = run_ensemble(states, 10., field, 10., CONFIG)
        fine_out, diagnostic = run_ensemble(states, 10., field, 10., fine, checks=True)
        changed += np.count_nonzero(coarse_out != fine_out)
        largest_fraction_change = max(largest_fraction_change,
                                      abs(np.mean(coarse_out==1)-np.mean(fine_out==1)))
    records["step_halving"] = {"trajectories": 2048, "changed_destinations": int(changed),
                               "max_central_fraction_change": float(largest_fraction_change),
                               "last_case_max_scaled_energy_error": float(diagnostic[:,1].max())}

    fields = np.linspace(0, 0.008, 500)
    curve = independent_slice_transmission(fields, 10, 3.428, 2000, radius, filament)
    records["thermal_reference"] = {"zero_field_transmission": float(curve[0]),
                                     "largest_increase": float(np.diff(curve).max()),
                                     "transmission_at_8mT": float(curve[-1])}
    passed = (records["pure_magnetic_rotation"]["relative_speed_error"] < 1e-8
              and records["pure_magnetic_rotation"]["position_error_m"] < 1e-9
              and records["cold_cutoff"]["relative_error"] < 1e-4
              and mismatches == 0 and still_flying == 0
              and max_energy < 1e-4 and max_momentum < 1e-4
              and records["vacuum_field"]["relative_gradient_error"] < 1e-5
              and records["vacuum_field"]["scaled_laplace_residual"] < 1e-5
              and largest_fraction_change <= 1/512
              and curve[0] > .999 and np.diff(curve).max() < 1e-12)
    records["all_passed"] = bool(passed)
    output=Path(os.environ.get("MAGNETRON_DATA_DIR",str(DIRECTORY.parents[1]/"results")))/"latest"/"reference_model.json"
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(records,indent=2),encoding="utf-8")
    print(json.dumps(records,indent=2),flush=True)
    assert passed, "A physical benchmark failed; inspect results/latest/reference_model.json before running sweeps."


if __name__ == "__main__":
    main()
