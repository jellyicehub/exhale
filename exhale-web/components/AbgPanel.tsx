import type { Reading } from '@/lib/readings';
import { getAcidityClassification } from '@/lib/readings';

interface AbgPanelProps {
  reading: Reading | null;
}

export default function AbgPanel({ reading }: AbgPanelProps) {
  if (!reading) return null;

  // We only show the full panel if the reading has been processed by the Cloud AI
  const isProcessed = reading.ai_processed;

  // Use the AI estimated values if available, otherwise fallback to the device's basic estimate
  const ph = isProcessed ? reading.ph_est : reading.estimated_ph;
  const pco2 = isProcessed ? reading.paco2_est_mmhg : null;
  const hco3 = isProcessed ? reading.hco3_est_meql : null;
  const be = isProcessed ? reading.base_excess_meql : null;
  const po2 = isProcessed ? reading.po2_est_mmhg : null;
  const o2sat = isProcessed ? reading.o2sat_est_pct : null;

  const getStatus = (val: number | null | undefined, min: number, max: number) => {
    if (val == null) return { text: '–', color: 'var(--color-text-tertiary)' };
    if (val < min) return { text: 'Low', color: 'var(--color-danger)' };
    if (val > max) return { text: 'High', color: 'var(--color-danger)' };
    return { text: 'Normal', color: 'var(--color-success)' };
  };

  const rows = [
    { label: 'pH', value: ph, unit: '', range: '7.35 – 7.45', ...getStatus(ph, 7.35, 7.45) },
    { label: 'pCO₂', value: pco2, unit: 'mmHg', range: '35 – 45', ...getStatus(pco2, 35, 45) },
    { label: 'HCO₃⁻', value: hco3, unit: 'mEq/L', range: '22 – 26', ...getStatus(hco3, 22, 26) },
    { label: 'Base Excess', value: be, unit: 'mEq/L', range: '-2 – +2', ...getStatus(be, -2, 2) },
    { label: 'pO₂', value: po2, unit: 'mmHg', range: '75 – 100', ...getStatus(po2, 75, 100) },
    { label: 'O₂ Sat', value: o2sat, unit: '%', range: '95 – 100', ...getStatus(o2sat, 95, 100) },
  ];

  return (
    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
      <div className="card-title">Clinical ABG Estimation</div>
      {!isProcessed ? (
        <div style={{ color: 'var(--color-text-secondary)', padding: 'var(--space-4) 0' }}>
          This reading is waiting for Cloud AI processing to generate full ABG parameters.
        </div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 'var(--space-4)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem', color: 'var(--color-text-secondary)' }}>Parameter</th>
                <th style={{ padding: '0.5rem', color: 'var(--color-text-secondary)' }}>Value</th>
                <th style={{ padding: '0.5rem', color: 'var(--color-text-secondary)' }}>Unit</th>
                <th style={{ padding: '0.5rem', color: 'var(--color-text-secondary)' }}>Reference</th>
                <th style={{ padding: '0.5rem', color: 'var(--color-text-secondary)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 500 }}>{row.label}</td>
                  <td style={{ padding: '0.5rem' }}>
                    {row.value != null ? row.value.toFixed(row.label === 'pH' ? 2 : 1) : '–'}
                  </td>
                  <td style={{ padding: '0.5rem', color: 'var(--color-text-tertiary)' }}>{row.unit}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--color-text-tertiary)' }}>{row.range}</td>
                  <td style={{ padding: '0.5rem', color: row.color, fontWeight: 500 }}>
                    {row.text === 'Normal' ? '🟢 ' : (row.text === '–' ? '' : '🔴 ')} {row.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>EXHALE Acidity Index:</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                {reading.acidity_index.toFixed(1)} <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--color-text-secondary)' }}>/ 100</span>
              </span>
            </div>
            <div style={{ textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
              Classification: {getAcidityClassification(reading.acidity_index)}
            </div>
          </div>
          {reading.calibration_meta && (
             <details style={{ marginTop: 'var(--space-4)', color: 'var(--color-text-tertiary)', fontSize: '0.85rem' }}>
               <summary style={{ cursor: 'pointer' }}>Show Calibration Metadata</summary>
               <pre style={{ background: 'var(--color-bg-subtle)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-2)', overflowX: 'auto' }}>
                 {JSON.stringify(reading.calibration_meta, null, 2)}
               </pre>
             </details>
          )}
        </>
      )}
    </div>
  );
}
