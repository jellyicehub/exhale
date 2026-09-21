import type { Reading } from './readings';
import { getAcidityClassification } from './readings';

/**
 * Exports an array of readings as a downloadable CSV file.
 * Uses only the browser's native Blob + URL APIs — no external dependencies.
 */
export function exportReadingsCSV(readings: Reading[], filename = 'exhale-readings.csv'): void {
  const HEADERS = [
    'Date',
    'Time',
    'Acidity Index',
    'Classification',
    'pH',
    'pCO2 (mmHg)',
    'HCO3 (mEq/L)',
    'Base Excess (mEq/L)',
    'CO2 (ppm)',
    'Temp (°C)',
    'Humidity (%)',
    'Source',
  ];

  const rows = readings.map((r) => {
    const dt = new Date(r.created_at);
    const date = dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const ph = r.ai_processed && r.ph_est != null ? r.ph_est : r.estimated_ph;
    const pco2 = r.paco2_est_mmhg ?? '';
    const hco3 = r.hco3_est_meql ?? '';
    const be   = r.base_excess_meql ?? '';

    return [
      date,
      time,
      r.acidity_index.toFixed(1),
      getAcidityClassification(r.acidity_index),
      ph != null ? ph.toFixed(2) : '',
      pco2 !== '' ? Number(pco2).toFixed(1) : '',
      hco3 !== '' ? Number(hco3).toFixed(1) : '',
      be   !== '' ? Number(be).toFixed(1)   : '',
      r.co2.toFixed(0),
      r.temperature.toFixed(1),
      r.humidity.toFixed(1),
      r.ai_processed ? 'Cloud' : 'Device',
    ];
  });

  const escape = (val: string | number) => {
    const s = String(val);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const csv = [
    HEADERS.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
