import React from 'react';

export default function Navbar({ health, onRefresh }) {
  const isHealthy = health?.status === 'ok';
  const dbMode = health?.database === 'supabase-postgresql' ? 'Supabase PostgreSQL' : 'Local Storage';

  return (
    <header className="header">
      <div className="brand-wrapper">
        <div className="brand-icon">◧</div>
        <div>
          <h1 className="brand-title">INE Price Tracker</h1>
          <p className="brand-subtitle">Automated Price & Stock Monitor for INE Mock Store</p>
        </div>
      </div>

      <div className="header-badges">
        <div className="status-badge" title={`Database: ${dbMode}`}>
          <span className={`status-dot ${isHealthy ? 'green' : 'amber'}`}></span>
          <span>{dbMode}</span>
        </div>

        <a
          href="https://demo.inelabteamdev.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="status-badge"
          style={{ textDecoration: 'none' }}
        >
          <span>Storefront</span>
          <span style={{ fontSize: '0.7rem' }}>↗</span>
        </a>

        <button
          id="btn-refresh-all"
          className="status-badge"
          onClick={onRefresh}
          title="Refresh dashboard data"
        >
          <span>↻ Refresh</span>
        </button>
      </div>
    </header>
  );
}
