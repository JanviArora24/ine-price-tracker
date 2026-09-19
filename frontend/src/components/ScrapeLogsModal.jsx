import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function ScrapeLogsModal({ product, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!product) return;
    setLoading(true);
    setError(null);
    api.getScrapeLogs(product.id, 50)
      .then(data => setLogs(data.logs || []))
      .catch(err => setError(err.message || 'Failed to load scrape logs'))
      .finally(() => setLoading(false));
  }, [product]);

  if (!product) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} id="modal-scrape-logs">
        <div className="modal-header">
          <div>
            <h3>Scrape Execution Logs</h3>
            <p>{product.name} ({product.sku})</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <span className="spinner-inline"></span> Loading execution logs...
            </div>
          ) : error ? (
            <div style={{ color: 'var(--accent-danger)', padding: '1rem' }}>⚠ {error}</div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-subtle)' }}>
              No scrape logs recorded for this product yet.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Duration</th>
                  <th>Details / Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const status = log.status || 'unknown';
                  return (
                    <tr key={log.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(log.attempted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td>
                        <span className={`status-pill ${status}`}>{status}</span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {log.attempts} {log.attempts === 1 ? 'try' : 'tries'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {log.duration_ms ? `${log.duration_ms}ms` : '—'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: log.error_message ? '#f87171' : 'var(--text-muted)' }}>
                        {log.error_message ? (
                          <span>⚠ {log.error_message}</span>
                        ) : (
                          <span style={{ color: '#34d399' }}>✓ Verified live extraction</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
