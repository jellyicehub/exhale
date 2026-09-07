"""
EXHALE — Cloud AI Microservice  (app/main.py)
FastAPI app: Supabase webhook → 4-layer env calibration → ABG → write back
"""

from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

from app.calibration import apply_environmental_calibration, CalibrationInput
from app.abg import compute_abg_parameters, AbgInput
from app.supabase_client import patch_reading

app = FastAPI(
    title="EXHALE Cloud AI",
    description="Environmental calibration + ABG estimation from breath sensor data",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────
#  Request / Response models
# ──────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    reading_id:      str   = Field(..., description="UUID of reading row in Supabase")
    co2_ppm:         float = Field(..., description="SCD41 CO2 reading ppm")
    temperature_c:   float = Field(..., description="SCD41 temperature °C")
    humidity_rh:     float = Field(..., description="SCD41 relative humidity %")
    ambient_co2_ppm: float = Field(415.0)
    ambient_temp_c:  float = Field(25.0)
    ambient_rh:      float = Field(50.0)
    pressure_hpa:    Optional[float] = Field(None, description="Local barometric pressure hPa; None = Open-Meteo fallback")
    spo2_pct:        Optional[float] = Field(None, ge=50, le=100, description="Pulse oximeter SpO2 %")


class CalibrationMeta(BaseModel):
    pressure_hpa:               float
    pressure_source:            str
    ambient_co2_delta_ppm:      float
    water_vapor_correction_mmhg: float
    temp_corrected_pka:         float


class AnalyzeResponse(BaseModel):
    reading_id:          str
    etco2_mmhg:          float
    etco2_dry_mmhg:      float
    paco2_est_mmhg:      float
    ph_est:              float
    hco3_est_meql:       float
    base_excess_meql:    float
    po2_est_mmhg:        Optional[float]
    o2sat_est_pct:       Optional[float]
    acidity_index:       float
    classification:      str
    calibration_meta:    CalibrationMeta


# ──────────────────────────────────────────────────────────────
#  Supabase DB Webhook  (fired automatically on INSERT)
# ──────────────────────────────────────────────────────────────

class WebhookPayload(BaseModel):
    type:   str
    table:  str
    record: dict
    schema: Optional[str] = "public"


@app.post("/webhook/reading-inserted")
async def supabase_webhook(payload: WebhookPayload, background_tasks: BackgroundTasks):
    """
    Supabase fires this on every INSERT into readings.
    Return immediately; run the analysis in the background.
    """
    if payload.type != "INSERT" or payload.table != "readings":
        return {"status": "ignored"}

    record = payload.record
    reading_id = record.get("id")
    if not reading_id:
        return {"status": "no_id"}

    req = AnalyzeRequest(
        reading_id      = reading_id,
        co2_ppm         = float(record.get("co2", 40000)),
        temperature_c   = float(record.get("temperature", 33.0)),
        humidity_rh     = float(record.get("humidity", 90.0)),
        ambient_co2_ppm = float(record.get("ambient_co2_ppm") or 415.0),
        ambient_temp_c  = float(record.get("ambient_temp_c") or 25.0),
        ambient_rh      = float(record.get("ambient_rh_pct") or 50.0),
        pressure_hpa    = record.get("pressure_hpa"),
        spo2_pct        = record.get("spo2_input_pct"),
    )

    background_tasks.add_task(_run_pipeline, req)
    return {"status": "queued", "reading_id": reading_id}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """Direct endpoint — useful for re-processing, testing, or SpO2 updates."""
    return await _run_pipeline(req)


# ──────────────────────────────────────────────────────────────
#  Core pipeline
# ──────────────────────────────────────────────────────────────

async def _run_pipeline(req: AnalyzeRequest) -> AnalyzeResponse:
    """4-layer env calibration → ABG computation → Supabase PATCH."""

    # Layer 1–4: Environmental Calibration
    calib = await apply_environmental_calibration(CalibrationInput(
        co2_ppm         = req.co2_ppm,
        temperature_c   = req.temperature_c,
        humidity_rh     = req.humidity_rh,
        ambient_co2_ppm = req.ambient_co2_ppm,
        ambient_temp_c  = req.ambient_temp_c,
        ambient_rh      = req.ambient_rh,
        pressure_hpa    = req.pressure_hpa,
    ))

    # ABG computation from calibrated pCO2
    abg = compute_abg_parameters(AbgInput(
        paco2_est_mmhg = calib.paco2_est_mmhg,
        breath_temp_c  = req.temperature_c,
        spo2_pct       = req.spo2_pct,
    ))

    # Acidity Index from pH
    # pH 7.60 → AI=0  |  pH 7.40 → AI=50  |  pH 7.20 → AI=100
    ai = 50.0 + ((7.40 - abg.ph_est) / 0.20) * 50.0
    ai = round(max(0.0, min(100.0, ai)), 2)

    result = AnalyzeResponse(
        reading_id       = req.reading_id,
        etco2_mmhg       = calib.etco2_mmhg,
        etco2_dry_mmhg   = calib.etco2_dry_mmhg,
        paco2_est_mmhg   = calib.paco2_est_mmhg,
        ph_est           = abg.ph_est,
        hco3_est_meql    = abg.hco3_est_meql,
        base_excess_meql = abg.base_excess_meql,
        po2_est_mmhg     = abg.po2_est_mmhg,
        o2sat_est_pct    = abg.o2sat_est_pct,
        acidity_index    = ai,
        classification   = _classify(ai),
        calibration_meta = CalibrationMeta(
            pressure_hpa               = calib.pressure_hpa,
            pressure_source            = calib.pressure_source,
            ambient_co2_delta_ppm      = calib.ambient_co2_delta_ppm,
            water_vapor_correction_mmhg= calib.water_vapor_correction_mmhg,
            temp_corrected_pka         = calib.temp_corrected_pka,
        ),
    )

    await patch_reading(req.reading_id, result)
    return result


def _classify(ai: float) -> str:
    if ai <= 20: return "Very Low Acidity"
    if ai <= 40: return "Low Acidity"
    if ai <= 55: return "Normal/Baseline"
    if ai <= 70: return "Slightly Elevated"
    if ai <= 85: return "Elevated"
    return "Highly Elevated"


@app.get("/health")
def health():
    return {"status": "ok", "service": "exhale-cloud-ai"}
