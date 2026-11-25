"""Exact anode-reach fraction for the ideal exercise, with no sampling error.

Setup: equipotential cathode at radius r_c, anode radius R_A, field B along the tube
axis, electrons launched outward from the filament surface with the flux distribution
(radial kinetic energy exponential with mean kT, tangential and axial speeds Gaussian
with variance kT/m each).

Energy plus canonical angular momentum L = m r_c v_t - e B r_c^2 / 2 give the reach
condition as one inequality at the anode radius:

    E_kin  >=  V_eff(R_A) ,   V_eff(R_A) = -e U_a + (L + e B R_A^2 / 2)^2 / (2 m R_A^2) .

Collecting the bracket turns that into a window on the tangential speed,

    L + e B R_A^2 / 2 = m r_c (v_t - v_0) ,
    v_0 = -e B (R_A^2 - r_c^2) / (2 m r_c) ,
    |v_t - v_0|  <=  v_e ,   v_e = sqrt(2 e U_a / m) * R_A / r_c .

Nothing else enters: the axial speed and the launch position drop out of the barrier
exactly, so the reach fraction is the Gaussian weight of that window,

    P = Phi((v_0 + v_e) / sigma) - Phi((v_0 - v_e) / sigma) ,   sigma = sqrt(kT / m) ,

with Phi the standard normal cumulative distribution.  Near a millitesla the window is
about ten thermal widths across and its centre sits within a thermal width of zero, so
P stays just under one until the window walks off the distribution; that is the rounded
knee the real data shows.

This is a necessary condition and it is tight at both ends of its range: while the window
is open it covers the whole distribution, so every electron reaches the anode radius, and
once it shuts nothing reaches at all.  In between, over the last percent or so of field
before the cutoff, the window is narrower than the thermal spread and the simulated
collection can sit above zero for a little longer than the window suggests; that band is
where the criterion stops being sufficient.

The reference the Monte Carlo path is checked against is therefore the pair of facts the
window does pin down:

  * window open  -> collected + end-face exit equals one, to the last particle;
  * window shut  -> nothing is collected, and every electron returns to the cathode.

The half-height of the simulated curve lands on the field where the window closes, which
is algebraically the same as the cold cutoff field.

It does not cover the gradient-on case: the axial electric field there couples v_z into
the motion and this barrier is no longer the whole story.
"""
import math

from scipy.constants import e, k, m_e
from scipy.special import ndtr


class NotExact(Exception):
    """This parameter set is outside the closed-form criterion."""


def tangential_window(field_T, anode_voltage, filament_radius_m, anode_radius_m):
    """Return (v_centre, v_half_width) in m/s for the reachable tangential speeds."""
    centre = -e * field_T * (anode_radius_m ** 2 - filament_radius_m ** 2) / (2 * m_e * filament_radius_m)
    half_width = math.sqrt(2 * e * anode_voltage / m_e) * anode_radius_m / filament_radius_m
    return centre, half_width


def exact_reach_fraction(field_mT, params, config):
    """Fraction of emitted electrons that reach the anode radius before anything else."""
    if params["gradient"]:
        raise NotExact("gradient on: the axial electric field couples v_z, so this barrier is not the whole story")
    if params["tilt_deg"] != 0:
        raise NotExact("tilted field: the axial direction stops being ignorable")
    anode_voltage = params["anode_V"] - params["filament_V"] / 2
    if anode_voltage < 0:
        raise NotExact("negative anode voltage")
    filament_radius = config["filament_radius_m"]
    anode_radius = config["anode_radius_m"]
    if not 0 < filament_radius < anode_radius:
        raise NotExact("geometry outside the coaxial model")
    thermal_energy = k * params["temperature_K"]
    if thermal_energy <= 0:
        raise NotExact("zero temperature")
    if field_mT == 0:
        # Without a field nothing opposes the radial motion, so reaching the anode
        # radius only needs a nonzero radial speed, which has full measure.
        return 1.0
    centre, half_width = tangential_window(field_mT * 1e-3, anode_voltage,
                                           filament_radius, anode_radius)
    sigma = math.sqrt(thermal_energy / m_e)
    return float(ndtr((centre + half_width) / sigma) - ndtr((centre - half_width) / sigma))
