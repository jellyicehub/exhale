'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Reading } from '@/lib/readings';
import type { DateRange } from '@/lib/readings';

interface AcidityChartProps {
  readings:      Reading[];
  dateRange:     DateRange;
  onRangeChange: (r: DateRange) => void;
}

const RANGE_LABELS: Record<DateRange, string> = {
  today:  'Today',
  '7days': '7 Days',
  '30days':'30 Days',
  all:    'All Time',
};

function aiColor(ai: number): string {
  if (ai < 33)  return '#22c55e';
  if (ai < 66)  return '#f59e0b';
  return '#ef4444';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { label: string; acidity_index: number; estimated_ph: number; co2: number };
  return (
    <div style={{
      background: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '12px 16px',
      fontSize: '0.8rem',
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ color: aiColor(d.acidity_index), fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '1.1rem' }}>
        AI: {d.acidity_index.toFixed(1)}
      </div>
      <div style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
        pH {d.estimated_ph?.toFixed(2)} &nbsp;·&nbsp; CO₂ {d.co2?.toFixed(0)} ppm
      </div>
    </div>
  );
}

export default function AcidityChart({ readings, dateRange, onRangeChange }: AcidityChartProps) {
  const data = [...readings]
    .reverse()
    .map(r => ({
      label:        new Date(r.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      }),
      acidity_index: parseFloat(r.acidity_index.toFixed(1)),
      estimated_ph:  r.estimated_ph,
      co2:           r.co2,
    }));

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
        <span className="card-title" style={{ margin: 0 }}>Acidity Index Over Time</span>
        <div className="range-tabs">
          {(Object.keys(RANGE_LABELS) as DateRange[]).map(r => (
            <button
              key={r}
              id={`range-tab-${r}`}
              className={`range-tab ${dateRange === r ? 'active' : ''}`}
              onClick={() => onRangeChange(r)}
              type="button"
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--space-10) 0' }}>
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">No readings yet</div>
          <div className="empty-state-desc">Take a breath reading with your EXHALE device to see data here.</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#00d4c8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00d4c8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fill: '#4a5568', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#4a5568', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="acidity_index"
              stroke="#00d4c8"
              strokeWidth={2}
              fill="url(#aiGradient)"
              dot={{ fill: '#00d4c8', r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#00d4c8', stroke: '#0a0d12', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
