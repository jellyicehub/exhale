import { getAcidityBadgeClass } from '@/lib/readings';

const referenceData = [
  { range: '0 - 20', label: 'Very Low Acidity', ai: 10 },
  { range: '21 - 40', label: 'Low Acidity', ai: 30 },
  { range: '41 - 55', label: 'Normal/Baseline', ai: 50 },
  { range: '56 - 70', label: 'Slightly Elevated', ai: 65 },
  { range: '71 - 85', label: 'Elevated', ai: 80 },
  { range: '86 - 100', label: 'Highly Elevated', ai: 95 },
];

export default function AcidityReferenceTable() {
  return (
    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h3 className="card-title" style={{ margin: 0 }}>Acidity Index Reference</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          Compare your readings against these standard Exhale baseline ranges.
        </p>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
        {referenceData.map((row) => (
          <div key={row.range} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '1rem',
            background: 'var(--color-bg-elevated)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)'
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '1.1rem' }}>{row.range}</span>
            <span className={`ai-badge ${getAcidityBadgeClass(row.ai)}`}>
              {row.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
