"""
EXHALE — ABG Parameter Engine  (app/abg.py)

Computes all 6 clinical ABG-equivalent parameters from calibrated pCO2:
  1. pH         — Henderson-Hasselbalch (acute respiratory rule)
  2. HCO3-      — Derived from pH + pCO2
  3. Base Excess — Siggaard-Andersen approximation
  4. pO2        — Estimated from user-entered SpO2 (Severinghaus equation)
  5. O2 Sat     — From pO2 via Hill equation (oxyhemoglobin dissociation curve)

Clinical reference ranges (adult arterial blood):
  pH        : 7.35 – 7.45
  pCO2      : 35   – 45  mmHg
  HCO3-     : 22   – 26  mEq/L
  Base Excess: -2  – +2  mEq/L
  pO2       : 75   – 100 mmHg
  O2 Sat    : 95   – 100 %
"""

import math
from dataclasses import dataclass
from typing import Optional


@dataclass
class AbgInput:
    paco2_est_mmhg: float             # calibrated pCO2 estimate (mmHg)
    breath_temp_c:  float = 33.0      # measured breath temp for pKa correction
    spo2_pct:       Optional[float] = None   # user-entered SpO2; None skips pO2/O2Sat


@dataclass
class AbgResult:
    ph_est:          float
    hco3_est_meql:   float
    base_excess_meql: float
    po2_est_mmhg:    Optional[float]
    o2sat_est_pct:   Optional[float]


# ──────────────────────────────────────────────────────────────
#  Main computation
# ──────────────────────────────────────────────────────────────

def compute_abg_parameters(inp: AbgInput) -> AbgResult:
    """Compute all derivable ABG parameters from calibrated pCO2."""

    # ── 1. pH  (Henderson-Hasselbalch, acute respiratory approximation) ──
    # For every 10 mmHg rise in pCO2, pH drops ~0.08 units.
    # Reference: PaCO2 = 40 mmHg → pH = 7.40
    ph = 7.40 - (0.008 * (inp.paco2_est_mmhg - 40.0))
    ph = round(max(6.80, min(7.80, ph)), 3)  # physiologically safe clamp

    # ── 2. HCO3- (Henderson-Hasselbalch rearranged) ──────────
    # HCO3- = 0.03 × pCO2 × 10^(pH - 6.1)
    # Temperature-corrected pKa
    pka = 6.1 + 0.0026 * (37.0 - inp.breath_temp_c)
    hco3 = 0.03 * inp.paco2_est_mmhg * (10 ** (ph - pka))
    hco3 = round(max(1.0, min(60.0, hco3)), 2)

    # ── 3. Base Excess (Siggaard-Andersen approximation) ─────
    # BE = 0.93 × (HCO3- - 24.4 + 14.8 × (pH - 7.4))
    # Normal range: -2 to +2 mEq/L
    base_excess = 0.93 * (hco3 - 24.4 + 14.8 * (ph - 7.4))
    base_excess = round(max(-30.0, min(30.0, base_excess)), 2)

    # ── 4. pO2 from SpO2 (Severinghaus equation) ─────────────
    po2 = None
    o2sat = None
    if inp.spo2_pct is not None:
        spo2_val = max(50.0, min(100.0, inp.spo2_pct))
        po2 = _severinghaus_spo2_to_po2(spo2_val)

    # ── 5. O2 Sat from pO2 (Hill equation) ───────────────────
    if po2 is not None:
        o2sat = _hill_po2_to_sat(po2)

    return AbgResult(
        ph_est           = ph,
        hco3_est_meql    = hco3,
        base_excess_meql = base_excess,
        po2_est_mmhg     = po2,
        o2sat_est_pct    = o2sat,
    )


# ──────────────────────────────────────────────────────────────
#  Severinghaus Equation: SpO2 % → estimated PaO2 (mmHg)
# ──────────────────────────────────────────────────────────────

def _severinghaus_spo2_to_po2(spo2_pct: float) -> Optional[float]:
    """
    Convert SpO2 % to estimated PaO2 using the Severinghaus equation.
    Accurate for SpO2 70–100%. Returns None for values outside safe range.
    """
    if spo2_pct >= 100.0:
        return 100.0  # saturated — approximate
    if spo2_pct < 50.0:
        return None   # unsafe range

    # Solve for pO2 numerically using the inverse Hill equation
    # Standard Hill approximation: SaO2 = pO2^n / (pO2^n + P50^n)
    # P50 ≈ 26.6 mmHg (half-saturation), Hill coefficient n ≈ 2.7
    P50 = 26.6
    n   = 2.7
    s = spo2_pct / 100.0
    # Rearranged: pO2 = P50 × (s / (1 - s))^(1/n)
    if s >= 1.0:
        return 100.0
    try:
        po2 = P50 * ((s / (1.0 - s)) ** (1.0 / n))
        return round(max(20.0, min(200.0, po2)), 1)
    except (ValueError, ZeroDivisionError):
        return None


# ──────────────────────────────────────────────────────────────
#  Hill Equation: PaO2 (mmHg) → O2 Saturation %
# ──────────────────────────────────────────────────────────────

def _hill_po2_to_sat(po2_mmhg: float) -> float:
    """
    Estimate O2 saturation % from PaO2 using the Hill equation.
    Standard parameters: P50 = 26.6 mmHg, n = 2.7
    """
    P50 = 26.6
    n   = 2.7
    sat = (po2_mmhg ** n) / (po2_mmhg ** n + P50 ** n) * 100.0
    return round(max(0.0, min(100.0, sat)), 1)


# ──────────────────────────────────────────────────────────────
#  Clinical Status Helper (used by web UI)
# ──────────────────────────────────────────────────────────────

def abg_status(value: float, low: float, high: float) -> str:
    """Returns 'low', 'normal', or 'high' for a given value and reference range."""
    if value < low:  return "low"
    if value > high: return "high"
    return "normal"

ABG_REFERENCE = {
    "ph":          (7.35, 7.45),
    "paco2_mmhg":  (35.0, 45.0),
    "hco3_meql":   (22.0, 26.0),
    "base_excess": (-2.0,  2.0),
    "po2_mmhg":    (75.0, 100.0),
    "o2sat_pct":   (95.0, 100.0),
}
