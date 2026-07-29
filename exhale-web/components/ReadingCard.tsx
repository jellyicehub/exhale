import type { Reading } from '@/lib/readings';

interface ReadingCardProps {
  reading: Reading;
}

function aiBadgeClass(ai: number): string {
  if (ai < 33) return 'low';
  if (ai < 66) return 'mid';
  return 'high';
}

function aiLabel(ai: number): string {
  if (ai < 20) return 'Low';
  if (ai < 45) return 'Moderate';
  if (ai < 70) return 'High';
  return 'Very High';
}

export default function ReadingCard({ reading: r }: ReadingCardProps) {
  const when  = new Date(r.created_at);
  const label = when.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const cls = aiBadgeClass(r.acidity_index);

  return (
    <tr>
      <td style={{ color: 'var(--color-text-secondary)' }}>{label}</td>
      <td style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
        <span className={`ai-badge ${cls}`}>
          {r.acidity_index.toFixed(1)} — {aiLabel(r.acidity_index)}
        </span>
      </td>
      <td>{r.estimated_ph.toFixed(2)}</td>
      <td>{r.co2.toFixed(0)}</td>
      <td>{r.temperature.toFixed(1)}°C</td>
      <td>{r.humidity.toFixed(1)}%</td>
    </tr>
  );
}
