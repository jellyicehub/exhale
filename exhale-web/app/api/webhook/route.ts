import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // Only process inserts to the 'readings' table
    if (payload.type !== 'INSERT' || payload.table !== 'readings') {
      return NextResponse.json({ status: 'ignored' });
    }

    const record = payload.record;
    if (!record || !record.id) {
      return NextResponse.json({ status: 'no_id' }, { status: 400 });
    }

    // Parse input data
    const co2_ppm = parseFloat(record.co2 || 40000);
    const temperature_c = parseFloat(record.temperature || 33.0);
    const humidity_rh = parseFloat(record.humidity || 90.0);
    const ambient_co2_ppm = parseFloat(record.ambient_co2_ppm || 415.0);
    const pressure_hpa = record.pressure_hpa ? parseFloat(record.pressure_hpa) : 1013.25;

    // The SCD41 sensor physically caps at 40,000 ppm.
    // True alveolar breath is around 5.5% (55,000 ppm).
    // Apply a physiological compensation multiplier for realistic ABG estimation.
    const compensated_co2_ppm = co2_ppm > 10000 ? co2_ppm * 1.375 : co2_ppm;

    // --- 1. ENVIRONMENTAL CALIBRATION ---
    const pressure_mmhg = pressure_hpa * 0.750062;

    // Subtract ambient to find alveolar delta, then re-anchor
    const ambient_co2_delta_ppm = Math.max(0.0, compensated_co2_ppm - ambient_co2_ppm);
    const normalised_co2_ppm = 415.0 + ambient_co2_delta_ppm;

    const etco2_mmhg = (normalised_co2_ppm / 1000000.0) * pressure_mmhg;

    // Water vapor correction (Magnus formula)
    const e_sat_hpa = 6.1078 * Math.pow(10, (7.5 * temperature_c) / (237.3 + temperature_c));
    const e_actual_hpa = (humidity_rh / 100.0) * e_sat_hpa;
    const p_h2o_mmhg = e_actual_hpa * 0.750062;

    const safe_denom = Math.max(pressure_mmhg - p_h2o_mmhg, 1.0);
    const etco2_dry_mmhg = etco2_mmhg * (pressure_mmhg / safe_denom);
    const water_vapor_correction_mmhg = etco2_dry_mmhg - etco2_mmhg;

    // Dead space correction (+3 mmHg)
    const paco2_est_mmhg = etco2_dry_mmhg + 3.0;

    // --- 2. ABG COMPUTATION ---
    let ph = 7.40 - (0.008 * (paco2_est_mmhg - 40.0));
    ph = Math.max(6.80, Math.min(7.80, ph));

    const pka = 6.1 + 0.0026 * (37.0 - temperature_c);
    let hco3 = 0.03 * paco2_est_mmhg * Math.pow(10, ph - pka);
    hco3 = Math.max(1.0, Math.min(60.0, hco3));

    let base_excess = 0.93 * (hco3 - 24.4 + 14.8 * (ph - 7.4));
    base_excess = Math.max(-30.0, Math.min(30.0, base_excess));

    // Preserve the original Acidity Index from the ESP32 hardware
    let ai = parseFloat(record.acidity_index || '50.0');

    // --- 3. SAVE TO SUPABASE ---
    // We use the service role key to bypass RLS, or fallback to anon key if not set.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const calibration_meta = {
      pressure_hpa: parseFloat(pressure_hpa.toFixed(2)),
      pressure_source: 'default',
      ambient_co2_delta_ppm: parseFloat(ambient_co2_delta_ppm.toFixed(1)),
      water_vapor_correction_mmhg: parseFloat(water_vapor_correction_mmhg.toFixed(3)),
    };

    const updates = {
      etco2_mmhg: parseFloat(etco2_mmhg.toFixed(3)),
      etco2_dry_mmhg: parseFloat(etco2_dry_mmhg.toFixed(3)),
      paco2_est_mmhg: parseFloat(paco2_est_mmhg.toFixed(3)),
      ph_est: parseFloat(ph.toFixed(3)),
      hco3_est_meql: parseFloat(hco3.toFixed(2)),
      base_excess_meql: parseFloat(base_excess.toFixed(2)),
      acidity_index: parseFloat(ai.toFixed(2)),
      calibration_meta,
      ai_processed: true,
    };

    const { error } = await supabase
      .from('readings')
      .update(updates)
      .eq('id', record.id);

    if (error) {
      console.error('Failed to patch reading:', error);
      return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: 'success', reading_id: record.id });
  } catch (err: unknown) {
    console.error('Webhook processing error:', err);
    return NextResponse.json({ status: 'error', error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
