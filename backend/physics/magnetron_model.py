"""Classical, collisionless reference models for the vacuum-diode experiment.

1. Finite-radius single-particle cutoff with thermionic flux integration.
2. Three-dimensional Newton-Lorentz trajectories in an exact harmonic potential
   on a TRUNCATED coaxial annulus, with optional axial cathode voltage gradient
   and a uniform tilted magnetic field. No self-consistent space charge.

The assumed lengths, cathode radius and boundary conditions are explicit in
model_config.json. No fitted tail, ad hoc random force or background is added.
"""
from pathlib import Path
import json

import numpy as np
from compat import njit, prange
from numpy.polynomial.hermite import hermgauss
from numpy.polynomial.legendre import leggauss
# SI constants from SciPy 1.15.3 / CODATA 2022; frozen to preserve this release.
e = 1.602176634e-19
m_e = 9.1093837139e-31
k = 1.380649e-23

DIRECTORY = Path(__file__).resolve().parent
CONFIG = json.loads((DIRECTORY / "model_config.json").read_text(encoding="utf-8"))
E_OVER_M = e / m_e


def cold_cutoff_T(anode_voltage, anode_radius, filament_radius):
    return np.sqrt(8 * m_e * anode_voltage / e) * anode_radius / (anode_radius**2 - filament_radius**2)


def independent_slice_transmission(field_T, anode_voltage, filament_voltage,
                                   temperature, anode_radius, filament_radius,
                                   filament_profile="uniform"):
    """Flux integral for independent coaxial slices; axial E is omitted here.

    The radial launch kinetic energy is exponential, mean kT. Integrate it
    analytically, tangential velocity by Gaussian quadrature and emission
    position by Legendre quadrature. This is a controlled reference model,
    not a complete finite-length diode model.
    """
    gaussian_nodes, gaussian_weights = hermgauss(80)
    position_nodes, position_weights = leggauss(96)
    fractions = (position_nodes + 1) / 2
    position_weights = position_weights / 2
    if filament_profile == "midpoint":
        fractions = np.array([0.5])
        position_weights = np.array([1.0])
    tangential_speed = np.sqrt(2 * k * temperature / m_e) * gaussian_nodes
    anode_tangential_speed = (
        filament_radius / anode_radius * tangential_speed[None, :]
        + E_OVER_M * np.asarray(field_T)[:, None]
        * (anode_radius**2 - filament_radius**2) / (2 * anode_radius)
    )
    minimum_radial_energy = (
        0.5 * m_e * anode_tangential_speed[:, :, None]**2
        - 0.5 * m_e * tangential_speed[None, :, None]**2
        - e * (anode_voltage - filament_voltage * fractions[None, None, :])
    )
    fraction = np.exp(-np.maximum(minimum_radial_energy, 0) / (k * temperature))
    return np.einsum("bvp,v,p->b", fraction, gaussian_weights / np.sqrt(np.pi), position_weights)


def emission_samples(count, seed, temperature, filament_radius, length):
    """Outward surface FLUX distribution, not abs(a Gaussian radial speed)."""
    from scipy.special import ndtri
    from scipy.stats import qmc

    unit = qmc.Sobol(d=5, scramble=True, seed=seed).random_base2(int(np.log2(count)))
    angle = 2 * np.pi * unit[:, 0]
    normal_speed = np.sqrt(-2 * k * temperature / m_e * np.log(unit[:, 2]))
    tangential_speed = np.sqrt(k * temperature / m_e) * ndtri(unit[:, 3])
    axial_speed = np.sqrt(k * temperature / m_e) * ndtri(unit[:, 4])
    states = np.empty((count, 6))
    states[:, 0] = filament_radius * np.cos(angle)
    states[:, 1] = filament_radius * np.sin(angle)
    states[:, 2] = length * (unit[:, 1] - 0.5)
    states[:, 3] = normal_speed * np.cos(angle) - tangential_speed * np.sin(angle)
    states[:, 4] = normal_speed * np.sin(angle) + tangential_speed * np.cos(angle)
    states[:, 5] = axial_speed
    return states


@njit(cache=True)
def potential(state, anode_voltage, filament_voltage, filament_radius, anode_radius, length):
    radius = np.hypot(state[0], state[1])
    cathode_potential = filament_voltage * (state[2] / length + 0.5)
    radial_fraction = np.log(radius / filament_radius) / np.log(anode_radius / filament_radius)
    return cathode_potential + (anode_voltage - cathode_potential) * radial_fraction


@njit(cache=True)
def derivatives(state, anode_voltage, filament_voltage, filament_radius, anode_radius, length, bx, bz):
    x, y, z, vx, vy, vz = state
    radius = np.hypot(x, y)
    log_ratio = np.log(anode_radius / filament_radius)
    cathode_potential = filament_voltage * (z / length + 0.5)
    radial_field = -(anode_voltage - cathode_potential) / (radius * log_ratio)
    axial_field = -filament_voltage / length * (1 - np.log(radius / filament_radius) / log_ratio)
    result = np.empty(6)
    result[0], result[1], result[2] = vx, vy, vz
    result[3] = -E_OVER_M * (radial_field * x / radius + vy * bz)
    result[4] = -E_OVER_M * (radial_field * y / radius + vz * bx - vx * bz)
    result[5] = -E_OVER_M * (axial_field - vy * bx)
    return result


@njit(cache=True)
def rk4_step(state, step, anode_voltage, filament_voltage, filament_radius, anode_radius, length, bx, bz):
    first = derivatives(state, anode_voltage, filament_voltage, filament_radius, anode_radius, length, bx, bz)
    second = derivatives(state + 0.5 * step * first, anode_voltage, filament_voltage, filament_radius, anode_radius, length, bx, bz)
    third = derivatives(state + 0.5 * step * second, anode_voltage, filament_voltage, filament_radius, anode_radius, length, bx, bz)
    fourth = derivatives(state + step * third, anode_voltage, filament_voltage, filament_radius, anode_radius, length, bx, bz)
    return state + step / 6 * (first + 2 * second + 2 * third + fourth)


@njit(cache=True)
def crossing_fraction(old_state, new_state, radius, inward):
    dx = new_state[0] - old_state[0]
    dy = new_state[1] - old_state[1]
    quadratic = dx * dx + dy * dy
    linear = 2 * (old_state[0] * dx + old_state[1] * dy)
    constant = old_state[0]**2 + old_state[1]**2 - radius**2
    root = np.sqrt(linear * linear - 4 * quadratic * constant)
    return (-linear - root if inward else -linear + root) / (2 * quadratic)


@njit(cache=True)
def trace_particle(initial, anode_voltage, filament_voltage, filament_radius,
                   anode_radius, length, central_length, field_T, tilt_rad,
                   max_step, step_scale, max_time, check_invariants=False, record_path=False):
    """Outcomes: 0=cathode, 1=central, 2=guards, 3=axial exit, 4=still flying.

    First boundary along the final integration segment is used. Particles
    remaining at max_time are reported, never counted as cathode/collector.
    The sixth return value optionally records (time, x, y, z) through the same
    accepted steps and first boundary intersection used for collection counts.
    """
    bx, bz = field_T * np.sin(tilt_rad), field_T * np.cos(tilt_rad)
    state = initial.copy()
    elapsed = 0.0
    path = [(0.0, initial[0], initial[1], initial[2])]
    initial_energy = 0.5 * m_e * np.sum(state[3:]**2) - e * potential(state, anode_voltage, filament_voltage, filament_radius, anode_radius, length)
    initial_momentum = m_e * (state[0] * state[4] - state[1] * state[3]) - e * bz * (state[0]**2 + state[1]**2) / 2
    max_energy_error = 0.0
    max_momentum_error = 0.0
    step_count = 0
    while elapsed < max_time:
        rate = derivatives(state, anode_voltage, filament_voltage, filament_radius, anode_radius, length, bx, bz)
        speed = np.sqrt(np.sum(state[3:]**2))
        acceleration = np.sqrt(np.sum(rate[3:]**2))
        radius = np.hypot(state[0], state[1])
        step = min(max_step, max_time - elapsed)
        if speed > 0:
            step = min(step, step_scale * radius / speed)
        if acceleration > 0:
            step = min(step, np.sqrt(step_scale * radius / acceleration))
        if field_T != 0:
            step = min(step, 0.05 / (E_OVER_M * abs(field_T)))
        following = rk4_step(state, step, anode_voltage, filament_voltage, filament_radius, anode_radius, length, bx, bz)
        radius_after = np.hypot(following[0], following[1])
        first_fraction = 2.0
        outcome = 4
        if radius_after <= filament_radius:
            first_fraction = crossing_fraction(state, following, filament_radius, True)
            outcome = 0
        if radius_after >= anode_radius:
            fraction = crossing_fraction(state, following, anode_radius, False)
            if fraction < first_fraction:
                first_fraction = fraction
                arrival_z = state[2] + fraction * (following[2] - state[2])
                outcome = 1 if abs(arrival_z) <= central_length / 2 else 2
        if abs(following[2]) >= length / 2:
            end_z = np.sign(following[2]) * length / 2
            fraction = (end_z - state[2]) / (following[2] - state[2])
            if fraction < first_fraction:
                first_fraction = fraction
                outcome = 3
        if first_fraction <= 1:
            arrival_time = elapsed + step * first_fraction
            if record_path:
                arrival = state + first_fraction * (following - state)
                path.append((arrival_time, arrival[0], arrival[1], arrival[2]))
            return outcome, arrival_time, max_energy_error, max_momentum_error, step_count + 1, path
        state = following
        elapsed += step
        step_count += 1
        if record_path:
            path.append((elapsed, state[0], state[1], state[2]))
        if check_invariants:
            energy = 0.5 * m_e * np.sum(state[3:]**2) - e * potential(state, anode_voltage, filament_voltage, filament_radius, anode_radius, length)
            momentum = m_e * (state[0] * state[4] - state[1] * state[3]) - e * bz * (state[0]**2 + state[1]**2) / 2
            max_energy_error = max(max_energy_error, abs(energy - initial_energy) / (e * anode_voltage + abs(initial_energy)))
            if bz != 0:
                max_momentum_error = max(max_momentum_error, abs(momentum - initial_momentum) / (e * abs(bz) * anode_radius**2 / 2))
    return 4, elapsed, max_energy_error, max_momentum_error, step_count, path


@njit(cache=True, parallel=True)
def trace_ensemble(states, anode_voltage, filament_voltage, filament_radius,
                   anode_radius, length, central_length, field_T, tilt_rad,
                   max_step, step_scale, max_time, check_invariants=False):
    outcomes = np.empty(len(states), dtype=np.int64)
    diagnostics = np.empty((len(states), 4))
    for i in prange(len(states)):
        result = trace_particle(states[i], anode_voltage, filament_voltage, filament_radius,
                                anode_radius, length, central_length, field_T, tilt_rad,
                                max_step, step_scale, max_time, check_invariants)
        outcomes[i] = result[0]
        diagnostics[i, 0] = result[1]
        diagnostics[i, 1] = result[2]
        diagnostics[i, 2] = result[3]
        diagnostics[i, 3] = result[4]
    return outcomes, diagnostics


def run_ensemble(states, voltage, field_T, tilt_deg, config=CONFIG, checks=False):
    return trace_ensemble(states, voltage, config["filament_voltage_V"], config["filament_radius_m"],
                          config["anode_radius_m"], config["tube_length_m"], config["central_collector_length_m"],
                          field_T, np.deg2rad(tilt_deg), config["max_step_s"], config["relative_step_scale"],
                          config["max_flight_time_s"], checks)
