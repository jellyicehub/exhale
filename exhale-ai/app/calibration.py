"""
EXHALE — Environmental Calibration Engine  (app/calibration.py)

4-layer correction pipeline applied to every breath reading before ABG computation:
  Layer 1: Barometric pressure (altitude correction) → local P_atm in mmHg
  Layer 2: Water vapor correction (Dalton's Law) → EtCO2_dry
  Layer 3: Ambient CO2 subtraction → net alveolar delta
  Layer 4: Dead-space correction → estimated PaCO2
"""

import math
import os
from dataclasses import dataclass
from typing import Optional
import httpx


# ──────────────────────────────────────────────────────────────
#  Constants
# ──────────────────────────────────────────────────────────────

SEA_LEVEL_PRESSURE_MMHG = 760.0   # hPa sea level
DEAD_SPACE_CORRECTION_MMHG = 3.0  # EtCO2 underestimates PaCO2 by ~2–5 mmHg; use 3
NORMAL_BODY_TEMP_C = 37.0


# ──────────────────────────────────────────────────────────────
#  Data models
# ──────────────────────────────────────────────────────────────

@dataclass
class CalibrationInput:
    co2_ppm:         float
    temperature_c:   float          # SCD41 temp during breath
    humidity_rh:     float          # SCD41 RH during breath
    ambient_co2_ppm: float = 415.0
    ambient_temp_c:  float = 25.0
    ambient_rh:      float = 50.0
    pressure_hpa:    Optional[float] = None   # None = fetch from Open-Meteo


@dataclass
class CalibrationResult:
    # Intermediate values (all in mmHg)
    etco2_mmhg:               float   # raw ppm → mmHg
    etco2_dry_mmhg:           float   # after water vapor correction
    paco2_est_mmhg:           float   # after dead-space correction
    # Audit trail
    pressure_hpa:             float
    pressure_source:          str     # "hardware", "open-meteo", or "default"
    ambient_co2_delta_ppm:    float   # net alveolar CO2 above ambient
    water_vapor_correction_mmhg: float
    temp_corrected_pka:       float


# ──────────────────────────────────────────────────────────────
#  Main calibration function
# ──────────────────────────────────────────────────────────────

async def apply_environmental_calibration(inp: CalibrationInput) -> CalibrationResult:
    """Apply all 4 environmental calibration layers and return corrected values."""

    # ── Layer 1: Barometric Pressure ──────────────────────────
    pressure_hpa, pressure_source = await _get_pressure(inp.pressure_hpa)
    pressure_mmhg = pressure_hpa * 0.750062  # hPa → mmHg

    # ── Layer 3: Ambient CO2 Subtraction ─────────────────────
    # Isolate alveolar CO2 by subtracting room air baseline.
    # The net delta is the "true" breath-derived CO2 contribution.
    ambient_co2_delta_ppm = max(0.0, inp.co2_ppm - inp.ambient_co2_ppm)

    # Re-anchor: add delta back onto a standard ambient reference (415 ppm)
    # so the value is expressed as an absolute ppm on a normalised baseline.
    normalised_co2_ppm = 415.0 + ambient_co2_delta_ppm

    # ── Layer 1 (applied): ppm → mmHg using local pressure ───
    etco2_mmhg = (normalised_co2_ppm / 1_000_000.0) * pressure_mmhg

    # ── Layer 2: Water Vapor Correction (Dalton's Law) ────────
    # Exhaled breath is nearly 100% saturated. The water vapor
    # displaces CO2, causing NDIR sensors to under-read pCO2.
    # P_H2O calculated via Magnus formula at the measured breath temp.
    p_h2o_mmhg = _magnus_water_vapor_mmhg(inp.temperature_c, inp.humidity_rh)
    # EtCO2_dry = EtCO2_wet × (P_atm / (P_atm − P_H2O))
    safe_denom = max(pressure_mmhg - p_h2o_mmhg, 1.0)
    etco2_dry_mmhg = etco2_mmhg * (pressure_mmhg / safe_denom)
    water_vapor_correction_mmhg = round(etco2_dry_mmhg - etco2_mmhg, 3)

    # ── Layer 4: Dead-Space Correction ────────────────────────
    # EtCO2 underestimates true arterial pCO2 by ~2–5 mmHg.
    paco2_est_mmhg = etco2_dry_mmhg + DEAD_SPACE_CORRECTION_MMHG

    # ── Layer 4b: Temperature-Corrected pKa ──────────────────
    # pKa of bicarbonate buffer is 6.1 at 37°C.
    # Shifts by ~0.0026 per °C deviation (used in ABG computation).
    temp_corrected_pka = 6.1 + 0.0026 * (NORMAL_BODY_TEMP_C - inp.temperature_c)

    return CalibrationResult(
        etco2_mmhg               = round(etco2_mmhg, 3),
        etco2_dry_mmhg           = round(etco2_dry_mmhg, 3),
        paco2_est_mmhg           = round(paco2_est_mmhg, 3),
        pressure_hpa             = round(pressure_hpa, 2),
        pressure_source          = pressure_source,
        ambient_co2_delta_ppm    = round(ambient_co2_delta_ppm, 1),
        water_vapor_correction_mmhg = water_vapor_correction_mmhg,
        temp_corrected_pka       = round(temp_corrected_pka, 4),
    )


# ──────────────────────────────────────────────────────────────
#  Layer 1 Helper: Barometric Pressure
# ──────────────────────────────────────────────────────────────

# Default location used for Open-Meteo lookup (overridable via env vars).
# Set EXHALE_LATITUDE / EXHALE_LONGITUDE in Railway environment variables.
DEFAULT_LATITUDE  = float(os.getenv("EXHALE_LATITUDE",  "14.5995"))  # Manila default
DEFAULT_LONGITUDE = float(os.getenv("EXHALE_LONGITUDE", "120.9842"))

async def _get_pressure(hardware_hpa: Optional[float]) -> tuple[float, str]:
    """
    Return (pressure_hpa, source_label).
    Priority: hardware sensor > Open-Meteo API > default (1013.25 hPa).
    """
    if hardware_hpa is not None and 800 < hardware_hpa < 1100:
        return hardware_hpa, "hardware"

    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={DEFAULT_LATITUDE}&longitude={DEFAULT_LONGITUDE}"
            f"&current_weather=false"
            f"&hourly=surface_pressure&forecast_days=1"
            f"&timezone=auto"
        )
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            # hourly surface_pressure: take the first available value
            pressure = data["hourly"]["surface_pressure"][0]
            return float(pressure), "open-meteo"
    except Exception:
        pass

    return 1013.25, "default"


# ──────────────────────────────────────────────────────────────
#  Layer 2 Helper: Water Vapor Pressure (Magnus Formula)
# ──────────────────────────────────────────────────────────────

def _magnus_water_vapor_mmhg(temp_c: float, rh_pct: float) -> float:
    """
    Calculate water vapor partial pressure in mmHg using the Magnus formula.
    P_H2O (hPa) = rh/100 × 6.1078 × 10^(7.5 × T / (237.3 + T))
    Convert hPa → mmHg by × 0.750062.
    """
    e_sat_hpa = 6.1078 * (10 ** (7.5 * temp_c / (237.3 + temp_c)))
    e_actual_hpa = (rh_pct / 100.0) * e_sat_hpa
    return e_actual_hpa * 0.750062  # hPa → mmHg
