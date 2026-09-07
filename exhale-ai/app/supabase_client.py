"""
EXHALE — Supabase Client  (app/supabase_client.py)
Patches the computed ABG fields back onto the readings row.
"""

import os
import httpx

SUPABASE_URL     = os.environ["SUPABASE_URL"]       # e.g. https://xxx.supabase.co
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]  # service_role key (not anon)


async def patch_reading(reading_id: str, result) -> None:
    """
    PATCH /rest/v1/readings?id=eq.<reading_id>
    Writes all computed ABG + calibration fields back to the row.
    Uses the service_role key so it bypasses RLS.
    """
    url = f"{SUPABASE_URL}/rest/v1/readings?id=eq.{reading_id}"

    payload = {
        "etco2_mmhg":          result.etco2_mmhg,
        "etco2_dry_mmhg":      result.etco2_dry_mmhg,
        "paco2_est_mmhg":      result.paco2_est_mmhg,
        "ph_est":              result.ph_est,
        "hco3_est_meql":       result.hco3_est_meql,
        "base_excess_meql":    result.base_excess_meql,
        "po2_est_mmhg":        result.po2_est_mmhg,
        "o2sat_est_pct":       result.o2sat_est_pct,
        "acidity_index":       result.acidity_index,
        "calibration_meta":    result.calibration_meta.model_dump(),
        "ai_processed":        True,
    }

    headers = {
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }

    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.patch(url, json=payload, headers=headers)
        if resp.status_code not in (200, 204):
            raise RuntimeError(
                f"Supabase PATCH failed: {resp.status_code} — {resp.text}"
            )
