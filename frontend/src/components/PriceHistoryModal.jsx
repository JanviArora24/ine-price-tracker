import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function PriceHistoryModal({ product, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!product) return;
    setLoading(true);
    setError(null);
    api.getPriceHistory(product.id, 50)
      .then(data => setHistory(data.history || []))
      .catch(err => setError(err.message || 'Failed to load price history'))
      .finally(() => setLoading(false));
  }, [product]);

  if (!product) return null;

  // Calculate summary stats
  const prices = history.map(h => Number(h.price)).filter(p => !isNaN(p) && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  // Render simple SVG line chart
  const renderChart = () => {
    if (history.length < 2) {
      return (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-subtle)', fontSize: '0.85rem' }}>
          At least 2 historical data points are needed to render a trend chart.
        </div>
      );
    }

    // Sort chronologically for charting
    const chronological = [...history].sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));
    const width = 600;
    const height = 140;
    const padding = 20;

    const min = Math.min(...chronological.map(d => Number(d.price)));
    const max = Math.max(...chronological.map(d => Number(d.price)));
    const range = max - min || 1;

    const points = chronological.map((d, index) => {
      const x = padding + (index / (chronological.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((Number(d.price) - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="chart-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <span>Low: ₹{minPrice?.toLocaleString('en-IN')}</span>
          <span>Price Trend Over Time</span>
          <span>High: ₹{maxPrice?.toLocaleString('en-IN')}</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
          {/* Subtle grid line */}
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="3 3" />

          {/* Trend Polyline */}
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Data Points */}
          {chronological.map((d, i) => {
            const x = padding + (i / (chronological.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((Number(d.price) - min) / range) * (height - 2 * padding);
            return (
              <circle
                key={d.id || i}
                cx={x}
                cy={y}
                r="4"
                fill="#60a5fa"
                stroke="#0f172a"
                strokeWidth="2"
              >
                <title>{`₹${Number(d.price).toLocaleString('en-IN')} on ${new Date(d.scraped_at).toLocaleString()}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} id="modal-price-history">
        <div className="modal-header">
          <div>
            <h3>Price & Stock History</h3>
            <p>{product.name} ({product.sku})</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <span className="spinner-inline"></span> Loading historical data...
            </div>
          ) : error ? (
            <div style={{ color: 'var(--accent-danger)', padding: '1rem' }}>⚠ {error}</div>
          ) : (
            <>
              {renderChart()}

              {history.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-subtle)' }}>
                  No verified price history recorded yet. Scrape the product to record its initial entry.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(item.scraped_at).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 600, color: '#ffffff' }}>
                          ₹{Number(item.price).toLocaleString('en-IN')}
                        </td>
                        <td>
                          {item.stock > 0 ? (
                            <span style={{ color: '#34d399' }}>{item.stock} in stock</span>
                          ) : (
                            <span style={{ color: '#f87171' }}>Out of stock</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {item.stock_status || 'Verified'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
