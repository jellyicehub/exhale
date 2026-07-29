'use client';

import { useState, useEffect, useCallback } from 'react';
import { onAuthChange } from '@/lib/auth';
import { getReadings } from '@/lib/readings';
import type { Reading, DateRange } from '@/lib/readings';
import AcidityChart     from '@/components/AcidityChart';
import CalendarView     from '@/components/CalendarView';
import ReadingCard      from '@/components/ReadingCard';
import type { User } from '@supabase/supabase-js';

import { getAcidityClassification } from '@/lib/readings';

export default function DashboardPage() {
  const [readings,  setReadings]  = useState<Reading[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>('7days');
  const [loading,   setLoading]   = useState(true);
  const [user,      setUser]      = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthChange((u) => setUser(u));
    return unsub;
  }, []);

  const loadReadings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getReadings(user.id, dateRange);
      setReadings(data);
    } catch (err) {
      console.error('Failed to load readings', err);
    } finally {
      setLoading(false);
    }
  }, [user, dateRange]);

  useEffect(() => { loadReadings(); }, [loadReadings]);

  // Derived stats
  const avgAi    = readings.length
    ? readings.reduce((s, r) => s + r.acidity_index, 0) / readings.length
    : null;
  const lastR    = readings[0];

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Your breath acidity monitoring overview</p>
      </div>

      <div className="dashboard-controls" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <button 
          onClick={loadReadings} 
          disabled={loading}
          style={{
            padding: '0.4rem 0.8rem',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-primary)',
            cursor: loading ? 'wait' : 'pointer'
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {/* Summary Stats */}
      <div className="dashboard-stats" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card">
          <span className="stat-label">Total Readings</span>
          <span className="stat-value">{loading ? '–' : readings.length}</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Avg Acidity Index</span>
          <span className="stat-value">
            {loading ? '–' : avgAi !== null ? avgAi.toFixed(1) : '–'}
          </span>
          {avgAi !== null && !loading && (
            <span className="stat-unit">{getAcidityClassification(avgAi)}</span>
          )}
        </div>

        <div className="stat-card">
          <span className="stat-label">Latest pH (est.)</span>
          <span className="stat-value">
            {loading ? '–' : lastR ? lastR.estimated_ph.toFixed(2) : '–'}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Latest CO₂</span>
          <span className="stat-value">
            {loading ? '–' : lastR ? lastR.co2.toFixed(0) : '–'}
          </span>
          {lastR && !loading && <span className="stat-unit">ppm</span>}
        </div>
      </div>

      {/* Chart */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <AcidityChart
          readings={readings}
          dateRange={dateRange}
          onRangeChange={setDateRange}
        />
      </div>

      {/* Calendar + Recent Readings */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 380px) 1fr',
        gap: 'var(--space-6)',
        alignItems: 'start',
      }}>
        <CalendarView readings={readings} />

        <div className="card">
          <div className="card-title">Recent Readings</div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
              <span className="spinner" />
            </div>
          ) : readings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🫁</div>
              <div className="empty-state-title">No readings yet</div>
              <div className="empty-state-desc">Press the button on your EXHALE device to take a reading.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="readings-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Acidity Index</th>
                    <th>pH</th>
                    <th>CO₂ (ppm)</th>
                    <th>Temp</th>
                    <th>RH</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.slice(0, 15).map(r => (
                    <ReadingCard key={r.id} reading={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
