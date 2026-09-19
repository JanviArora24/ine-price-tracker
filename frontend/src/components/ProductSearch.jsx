import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function ProductSearch({ trackedIds = [], onProductTracked }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [trackingId, setTrackingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.searchProducts(query, 1, 12);
        setResults(data.items || []);
      } catch (err) {
        setError(err.message || 'Failed to search products');
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const handleTrack = async (product) => {
    setTrackingId(product.id);
    setError(null);
    try {
      await api.trackProduct(product.id);
      if (onProductTracked) onProductTracked();
    } catch (err) {
      if (err.status === 409) {
        setError(`Product "${product.name}" is already tracked.`);
      } else {
        setError(err.message || 'Failed to track product');
      }
    } finally {
      setTrackingId(null);
    }
  };

  return (
    <section className="search-section">
      <div className="search-header">
        <h2>Search & Track Products</h2>
        <p>Find any item in the INE mock store by name, brand, category, or SKU (e.g. "headphones", "slimbook", "NOR-10001")</p>
      </div>

      <div className="search-box">
        <span className="search-icon">🔍</span>
        <input
          id="input-product-search"
          type="text"
          className="search-input"
          placeholder="Search products in mock store..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            id="btn-clear-search"
            className="search-clear"
            onClick={() => setQuery('')}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '0.75rem', color: '#f87171', fontSize: '0.85rem' }}>
          ⚠ {error}
        </div>
      )}

      {loading && (
        <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="spinner-inline"></span> Searching INE mock store catalog...
        </div>
      )}

      {results.length > 0 && !loading && (
        <div className="search-results-wrapper">
          <div className="results-grid">
            {results.map((product) => {
              const isAlreadyTracked = trackedIds.includes(product.id);
              const isTrackingThis = trackingId === product.id;

              return (
                <div key={product.id} className="result-card" id={`search-result-${product.id}`}>
                  <div>
                    <div className="result-meta">
                      <span className="category-tag">{product.category}</span>
                      <span className="sku-text">{product.sku}</span>
                    </div>
                    <h3 className="result-title">{product.name}</h3>
                    <p className="result-brand">{product.brand}</p>
                  </div>

                  <button
                    id={`btn-track-${product.id}`}
                    className="btn-track"
                    disabled={isAlreadyTracked || isTrackingThis}
                    onClick={() => handleTrack(product)}
                  >
                    {isTrackingThis ? (
                      <>
                        <span className="spinner-inline"></span> Scraping & Tracking...
                      </>
                    ) : isAlreadyTracked ? (
                      <>✓ Tracked</>
                    ) : (
                      <>+ Track Product</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {query && !loading && results.length === 0 && (
        <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No products found matching "{query}".
        </div>
      )}
    </section>
  );
}
