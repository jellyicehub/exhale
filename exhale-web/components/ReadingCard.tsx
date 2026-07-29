import type { Reading } from '@/lib/readings';
import { getAcidityClassification, getAcidityBadgeClass } from '@/lib/readings';

interface ReadingCardProps {
  reading: Reading;
}

export default function ReadingCard({ reading: r }: ReadingCardProps) {
  const when  = new Date(r.created_at);
  const label = when.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const cls = getAcidityBadgeClass(r.acidity_index);

  return (
    <tr>
      <td style={{ color: 'var(--color-text-secondary)' }}>{label}</td>
      <td style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
        <span className={`ai-badge ${cls}`}>
          {r.acidity_index.toFixed(1)} — {getAcidityClassification(r.acidity_index)}
        </span>
      </td>
      <td>{r.estimated_ph.toFixed(2)}</td>
      <td>{r.co2.toFixed(0)}</td>
      <td>{r.temperature.toFixed(1)}°C</td>
      <td>{r.humidity.toFixed(1)}%</td>
    </tr>
  );
}
