'use client';

import { useState, useMemo } from 'react';
import type { Reading } from '@/lib/readings';

interface CalendarViewProps {
  readings: Reading[];
}

const DAYS    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS  = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];

function aiToColor(ai: number): string {
  // Green (22,197,94) -> Yellow (245,158,11) -> Red (239,68,68)
  const t = ai / 100;
  if (t < 0.5) {
    const s = t * 2;
    const r = Math.round(22  + (245 - 22)  * s);
    const g = Math.round(197 + (158 - 197) * s);
    const b = Math.round(94  + (11  - 94)  * s);
    return `rgba(${r},${g},${b},0.85)`;
  } else {
    const s = (t - 0.5) * 2;
    const r = Math.round(245 + (239 - 245) * s);
    const g = Math.round(158 + (68  - 158) * s);
    const b = Math.round(11  + (68  - 11)  * s);
    return `rgba(${r},${g},${b},0.85)`;
  }
}

export default function CalendarView({ readings }: CalendarViewProps) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Group readings by local date string
  const byDay = useMemo(() => {
    const map: Record<string, number[]> = {};
    readings.forEach(r => {
      const d   = new Date(r.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      (map[key] ??= []).push(r.acidity_index);
    });
    return map;
  }, [readings]);

  function avgAi(dateKey: string): number | null {
    const vals = byDay[dateKey];
    if (!vals?.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else              setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else               setMonth(m => m + 1);
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="card">
      <div className="calendar-header">
        <button id="cal-prev" className="calendar-nav-btn" onClick={prevMonth} type="button">‹</button>
        <span className="calendar-title">{MONTHS[month]} {year}</span>
        <button id="cal-next" className="calendar-nav-btn" onClick={nextMonth} type="button">›</button>
      </div>

      <div className="calendar-grid">
        {DAYS.map(d => (
          <div key={d} className="calendar-day-label">{d}</div>
        ))}

        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} className="calendar-cell empty" />;

          const key = `${year}-${month}-${day}`;
          const ai  = avgAi(key);
          const isToday =
            day === today.getDate() &&
            month === today.getMonth() &&
            year  === today.getFullYear();

          return (
            <div
              key={key}
              className={`calendar-cell ${ai !== null ? 'has-data' : 'no-data'}`}
              title={ai !== null ? `AI: ${ai.toFixed(1)}` : 'No reading'}
              style={ai !== null ? {
                background: aiToColor(ai),
                color: '#fff',
                outline: isToday ? '2px solid #00d4c8' : undefined,
              } : {
                outline: isToday ? '2px solid rgba(0,212,200,0.4)' : undefined,
              }}
            >
              {day}
            </div>
          );
        })}
      </div>

      <div style={{
        display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)',
        justifyContent: 'center', fontSize: '0.7rem', color: 'var(--color-text-muted)'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(34,197,94,0.85)', display:'inline-block' }} />
          Low
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(245,158,11,0.85)', display:'inline-block' }} />
          Moderate
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(239,68,68,0.85)', display:'inline-block' }} />
          High
        </span>
      </div>
    </div>
  );
}
