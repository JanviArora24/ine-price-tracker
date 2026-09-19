import React from 'react';

export default function StatsOverview({ products = [] }) {
  const totalTracked = products.length;
  const inStockCount = products.filter(p => p.current_stock > 0).length;
  const outOfStockCount = products.filter(p => p.current_stock === 0).length;
  const successfulScrapes = products.filter(p => p.last_scrape_status === 'success' || p.last_scrape_status === 'retried').length;
  const successRate = totalTracked > 0 ? Math.round((successfulScrapes / totalTracked) * 100) : 100;

  return (
    <div className="stats-grid">
      <div className="stat-card">
        <div>
          <div className="stat-label">Tracked Products</div>
          <div className="stat-value">{totalTracked}</div>
        </div>
        <div className="stat-icon">📦</div>
      </div>

      <div className="stat-card">
        <div>
          <div className="stat-label">In Stock</div>
          <div className="stat-value" style={{ color: '#34d399' }}>{inStockCount}</div>
        </div>
        <div className="stat-icon">✓</div>
      </div>

      <div className="stat-card">
        <div>
          <div className="stat-label">Out of Stock</div>
          <div className="stat-value" style={{ color: outOfStockCount > 0 ? '#f87171' : '#9ca3af' }}>
            {outOfStockCount}
          </div>
        </div>
        <div className="stat-icon">⚠</div>
      </div>

      <div className="stat-card">
        <div>
          <div className="stat-label">Scrape Health</div>
          <div className="stat-value" style={{ color: successRate >= 80 ? '#60a5fa' : '#fbbf24' }}>
            {successRate}%
          </div>
        </div>
        <div className="stat-icon">⚡</div>
      </div>
    </div>
  );
}
