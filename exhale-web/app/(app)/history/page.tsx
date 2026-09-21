'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthChange } from '@/lib/auth';
import { getReadings, getAcidityClassification, getAcidityBadgeClass } from '@/lib/readings';
import type { Reading, DateRange } from '@/lib/readings';
import { exportReadingsCSV } from '@/lib/export';
import type { User } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = 'created_at' | 'acidity_index' | 'ph' | 'pco2' | 'hco3' | 'be';
type SortDir = 'asc' | 'desc';

const RANGE_LABELS: Record<DateRange, string> = {
  today:   'Today',
  '7days': '7 Days',
  '30days':'30 Days',
  all:     'All Time',
};

const CLASSIFICATIONS = [
  'All',
  'Very Low Acidity',
  'Low Acidity',
  'Normal/Baseline',
  'Slightly Elevated',
  'Elevated',
  'Highly Elevated',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPh(r: Reading): number | null {
  return r.ai_processed && r.ph_est != null ? r.ph_est : r.estimated_ph ?? null;
}

function getStatus(
  val: number | null | undefined,
  min: number,
  max: number
): { label: string; cls: string } {
  if (val == null) return { label: '–', cls: 'status-pending' };
  if (val < min)   return { label: 'Low',    cls: 'status-low'    };
  if (val > max)   return { label: 'High',   cls: 'status-high'   };
  return           { label: 'Normal', cls: 'status-normal' };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="sort-icon sort-idle">↕</span>;
  return <span className="sort-icon sort-active">{sortDir === 'asc' ? '▲' : '▼'}</span>;
}

// ── Row expand detail ──────────────────────────────────────────────────────────

function RowDetail({ r }: { r: Reading }) {
  const ph   = getPh(r);
  const pco2 = r.paco2_est_mmhg;
  const hco3 = r.hco3_est_meql;
  const be   = r.base_excess_meql;

  const params = [
    { label: 'pH',          value: ph,   unit: '',       min: 7.35, max: 7.45, decimals: 2 },
    { label: 'pCO₂',        value: pco2, unit: 'mmHg',  min: 35,   max: 45,   decimals: 1 },
    { label: 'HCO₃⁻',       value: hco3, unit: 'mEq/L', min: 22,   max: 26,   decimals: 1 },
    { label: 'Base Excess',  value: be,   unit: 'mEq/L', min: -2,   max: 2,    decimals: 1 },
  ];

  return (
    <tr className="history-row-detail-row">
      <td colSpan={8} className="history-row-detail">
        <div className="row-detail-inner">
          {/* ABG parameters */}
          <div className="row-detail-section">
            <div className="row-detail-section-title">ABG Parameters</div>
            {!r.ai_processed ? (
              <div className="row-detail-pending">
                ⏳ Awaiting Cloud AI processing — full ABG values not yet available.
              </div>
            ) : (
              <div className="row-detail-grid">
                {params.map(p => {
                  const s = getStatus(p.value, p.min, p.max);
                  return (
                    <div key={p.label} className="row-detail-param">
                      <span className="row-detail-param-label">{p.label}</span>
                      <span className="row-detail-param-value">
                        {p.value != null ? p.value.toFixed(p.decimals) : '–'}
                        {p.unit && <span className="row-detail-param-unit"> {p.unit}</span>}
                      </span>
                      <span className={`status-badge ${s.cls}`}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sensor data */}
          <div className="row-detail-section">
            <div className="row-detail-section-title">Raw Sensor Data</div>
            <div className="row-detail-grid">
              <div className="row-detail-param">
                <span className="row-detail-param-label">CO₂</span>
                <span className="row-detail-param-value">{r.co2.toFixed(0)} <span className="row-detail-param-unit">ppm</span></span>
              </div>
              <div className="row-detail-param">
                <span className="row-detail-param-label">Temperature</span>
                <span className="row-detail-param-value">{r.temperature.toFixed(1)} <span className="row-detail-param-unit">°C</span></span>
              </div>
              <div className="row-detail-param">
                <span className="row-detail-param-label">Humidity</span>
                <span className="row-detail-param-value">{r.humidity.toFixed(1)} <span className="row-detail-param-unit">%RH</span></span>
              </div>
              {r.etco2_mmhg != null && (
                <div className="row-detail-param">
                  <span className="row-detail-param-label">EtCO₂</span>
                  <span className="row-detail-param-value">{r.etco2_mmhg.toFixed(2)} <span className="row-detail-param-unit">mmHg</span></span>
                </div>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [user,      setUser]      = useState<User | null>(null);
  const [readings,  setReadings]  = useState<Reading[]>([]);
  const [loading,   setLoading]   = useState(true);

  // Toolbar state
  const [dateRange,   setDateRange]   = useState<DateRange>('all');
  const [filterClass, setFilterClass] = useState('All');
  const [search,      setSearch]      = useState('');
  const [sortKey,     setSortKey]     = useState<SortKey>('created_at');
  const [sortDir,     setSortDir]     = useState<SortDir>('desc');
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [pageSize,    setPageSize]    = useState(25);
  const [page,        setPage]        = useState(1);

  // Auth
  useEffect(() => {
    const unsub = onAuthChange((u) => setUser(u));
    return unsub;
  }, []);

  // Load readings
  const loadReadings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getReadings(user.id, dateRange, 1000);
      setReadings(data);
      setPage(1);
    } catch (err) {
      console.error('Failed to load readings', err);
    } finally {
      setLoading(false);
    }
  }, [user, dateRange]);

  useEffect(() => { loadReadings(); }, [loadReadings]);

  // Sort toggle
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  // Row expand toggle
  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  // Filtered + sorted data
  const filtered = useMemo(() => {
    let rows = [...readings];

    // Classification filter
    if (filterClass !== 'All') {
      rows = rows.filter(r => getAcidityClassification(r.acidity_index) === filterClass);
    }

    // Search filter (date string)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r => formatDate(r.created_at).toLowerCase().includes(q));
    }

    // Sort
    rows.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case 'created_at':    av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime(); break;
        case 'acidity_index': av = a.acidity_index;                  bv = b.acidity_index;                  break;
        case 'ph':            av = getPh(a) ?? -Infinity;            bv = getPh(b) ?? -Infinity;            break;
        case 'pco2':          av = a.paco2_est_mmhg ?? -Infinity;    bv = b.paco2_est_mmhg ?? -Infinity;    break;
        case 'hco3':          av = a.hco3_est_meql ?? -Infinity;     bv = b.hco3_est_meql ?? -Infinity;     break;
        case 'be':            av = a.base_excess_meql ?? -Infinity;  bv = b.base_excess_meql ?? -Infinity;  break;
        default:              av = 0; bv = 0;
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });

    return rows;
  }, [readings, filterClass, search, sortKey, sortDir]);

  // Summary stats
  const avgAi  = filtered.length ? filtered.reduce((s, r) => s + r.acidity_index, 0) / filtered.length : null;
  const avgPh  = (() => {
    const vals = filtered.map(r => getPh(r)).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  })();

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  // CSV export — exports all filtered rows (not just current page)
  function handleExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    exportReadingsCSV(filtered, `exhale-readings-${stamp}.csv`);
  }

  // Th helper
  function Th({ label, col }: { label: string; col: SortKey }) {
    return (
      <th
        className="sortable"
        onClick={() => handleSort(col)}
        aria-sort={sortKey === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label} <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </th>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>Historical Records</h1>
          <p>All your breath readings — sortable, filterable &amp; exportable</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="history-toolbar">
        {/* Date range tabs */}
        <div className="range-tabs">
          {(Object.keys(RANGE_LABELS) as DateRange[]).map(r => (
            <button
              key={r}
              id={`history-range-${r}`}
              className={`range-tab ${dateRange === r ? 'active' : ''}`}
              onClick={() => { setDateRange(r); setPage(1); }}
              type="button"
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>

        {/* Classification filter */}
        <select
          id="history-filter-class"
          className="history-select"
          value={filterClass}
          onChange={e => { setFilterClass(e.target.value); setPage(1); }}
          aria-label="Filter by classification"
        >
          {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Search */}
        <div className="history-search-wrap">
          <span className="history-search-icon" aria-hidden="true">🔍</span>
          <input
            id="history-search"
            type="search"
            className="history-search"
            placeholder="Search by date…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search readings by date"
          />
        </div>

        {/* Export */}
        <button
          id="history-export-csv"
          className="btn btn-secondary history-export-btn"
          onClick={handleExport}
          disabled={filtered.length === 0}
          type="button"
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Summary bar */}
      {!loading && filtered.length > 0 && (
        <div className="history-summary-bar">
          <div className="history-summary-chip">
            <span className="history-summary-chip-label">Readings</span>
            <span className="history-summary-chip-value">{filtered.length}</span>
          </div>
          {avgAi != null && (
            <div className="history-summary-chip">
              <span className="history-summary-chip-label">Avg Acidity Index</span>
              <span className="history-summary-chip-value">{avgAi.toFixed(1)}</span>
            </div>
          )}
          {avgPh != null && (
            <div className="history-summary-chip">
              <span className="history-summary-chip-label">Avg pH</span>
              <span className="history-summary-chip-value">{avgPh.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* Table card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
            <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-16) var(--space-8)' }}>
            <div className="empty-state-icon">🫁</div>
            <div className="empty-state-title">No readings found</div>
            <div className="empty-state-desc">
              {readings.length === 0
                ? 'Press the button on your EXHALE device to take a reading.'
                : 'No readings match your current filter. Try adjusting the date range or classification.'}
            </div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="history-table">
                <thead>
                  <tr>
                    <Th label="Date & Time"    col="created_at"    />
                    <Th label="Acidity Index"  col="acidity_index" />
                    <Th label="pH"             col="ph"            />
                    <Th label="pCO₂"           col="pco2"          />
                    <Th label="HCO₃⁻"          col="hco3"          />
                    <Th label="Base Excess"    col="be"            />
                    <th>Source</th>
                    <th style={{ width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(r => {
                    const ph   = getPh(r);
                    const pco2 = r.paco2_est_mmhg;
                    const hco3 = r.hco3_est_meql;
                    const be   = r.base_excess_meql;
                    const isExpanded = expandedId === r.id;
                    const aiCls = getAcidityBadgeClass(r.acidity_index);

                    return [
                      <tr
                        key={r.id}
                        className={`history-row ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => toggleExpand(r.id)}
                        aria-expanded={isExpanded}
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && toggleExpand(r.id)}
                      >
                        <td className="history-cell-date">{formatDate(r.created_at)}</td>
                        <td>
                          <span className={`ai-badge ${aiCls}`}>
                            {r.acidity_index.toFixed(1)}
                          </span>
                          <span className="history-ai-label"> {getAcidityClassification(r.acidity_index)}</span>
                        </td>
                        <td>
                          <span className={`status-badge ${getStatus(ph, 7.35, 7.45).cls}`}>
                            {ph != null ? ph.toFixed(2) : '–'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${getStatus(pco2, 35, 45).cls}`}>
                            {pco2 != null ? `${pco2.toFixed(1)} mmHg` : '–'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${getStatus(hco3, 22, 26).cls}`}>
                            {hco3 != null ? `${hco3.toFixed(1)} mEq/L` : '–'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${getStatus(be, -2, 2).cls}`}>
                            {be != null ? (be >= 0 ? '+' : '') + be.toFixed(1) : '–'}
                          </span>
                        </td>
                        <td>
                          <span className={`source-pill ${r.ai_processed ? 'source-cloud' : 'source-device'}`}>
                            {r.ai_processed ? '☁ Cloud' : '📡 Device'}
                          </span>
                        </td>
                        <td className="history-expand-chevron">
                          <span style={{ transition: 'transform 200ms', display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                            ▾
                          </span>
                        </td>
                      </tr>,
                      isExpanded && <RowDetail key={`${r.id}-detail`} r={r} />,
                    ];
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="history-pagination">
              <div className="history-pagination-info">
                Showing {Math.min((page - 1) * pageSize + 1, filtered.length)}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </div>
              <div className="history-pagination-controls">
                <select
                  className="history-select history-pagesize"
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  aria-label="Rows per page"
                >
                  {[25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <button
                  id="history-prev-page"
                  className="history-page-btn"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  type="button"
                  aria-label="Previous page"
                >
                  ‹
                </button>
                <span className="history-page-indicator">{page} / {totalPages}</span>
                <button
                  id="history-next-page"
                  className="history-page-btn"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  type="button"
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
