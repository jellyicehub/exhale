'use client';

import { useState } from 'react';
import type { Reading } from '@/lib/readings';
import { getSupabase } from '@/lib/supabase';

interface SpO2InputProps {
  reading: Reading | null;
  onUpdate: () => void;
}

export default function SpO2Input({ reading, onUpdate }: SpO2InputProps) {
  const [spo2, setSpo2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!reading) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(spo2);
    
    if (isNaN(val) || val < 50 || val > 100) {
      setError('Please enter a valid SpO₂ between 50 and 100.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: dbError } = await getSupabase()
        .from('readings')
        .update({ spo2_input_pct: val })
        .eq('id', reading.id);

      if (dbError) throw dbError;
      
      // In a real scenario, this update might trigger the Supabase webhook again,
      // or we might need to manually call the /analyze endpoint.
      // For now, we just call onUpdate to refresh the UI.
      onUpdate();
      setSpo2('');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to update SpO₂');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
      <div className="card-title">Add Pulse Oximeter Reading</div>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-4)' }}>
        To estimate your partial pressure of oxygen (pO₂) and Oxygen Saturation (O₂ Sat) along with your CO₂ reading, enter your SpO₂ percentage from a standard pulse oximeter taken at the same time.
      </p>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <div>
          <input 
            type="number" 
            step="0.1" 
            min="50" 
            max="100" 
            placeholder="e.g. 98" 
            value={spo2}
            onChange={(e) => setSpo2(e.target.value)}
            style={{ 
              padding: '0.5rem', 
              borderRadius: 'var(--radius-sm)', 
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-base)',
              color: 'var(--color-text-primary)'
            }}
            disabled={loading}
          />
          <span style={{ marginLeft: '0.5rem', color: 'var(--color-text-secondary)' }}>% SpO₂</span>
        </div>
        <button 
          type="submit" 
          disabled={loading || !spo2}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: (loading || !spo2) ? 'not-allowed' : 'pointer',
            opacity: (loading || !spo2) ? 0.7 : 1
          }}
        >
          {loading ? 'Saving...' : 'Add to Reading'}
        </button>
      </form>
      {error && <div style={{ color: 'var(--color-danger)', marginTop: '0.5rem', fontSize: '0.85rem' }}>{error}</div>}
      
      {reading.spo2_input_pct && !error && (
        <div style={{ color: 'var(--color-success)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
          Current SpO₂ input: {reading.spo2_input_pct}%
        </div>
      )}
    </div>
  );
}
