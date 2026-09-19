import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import StatsOverview from './components/StatsOverview';
import ProductSearch from './components/ProductSearch';
import TrackedList from './components/TrackedList';
import PriceHistoryModal from './components/PriceHistoryModal';
import ScrapeLogsModal from './components/ScrapeLogsModal';
import { api } from './services/api';

export default function App() {
  const [products, setProducts] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [logsProduct, setLogsProduct] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchTrackedProducts = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await api.getTrackedProducts();
      setProducts(data.products || []);
    } catch (err) {
      console.error('Failed to fetch tracked products:', err);
      setErrorMessage(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch (err) {
      setHealth({ status: 'offline' });
    }
  }, []);

  useEffect(() => {
    fetchTrackedProducts();
    fetchHealth();
  }, [fetchTrackedProducts, fetchHealth]);

  const trackedExternalIds = products.map(p => p.external_product_id);

  return (
    <div className="app-container">
      <Navbar health={health} onRefresh={fetchTrackedProducts} />

      {errorMessage && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#f87171',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.5rem',
          fontSize: '0.85rem'
        }}>
          ⚠ {errorMessage}
        </div>
      )}

      <StatsOverview products={products} />

      <ProductSearch
        trackedIds={trackedExternalIds}
        onProductTracked={fetchTrackedProducts}
      />

      <TrackedList
        products={products}
        loading={loading}
        onRefresh={fetchTrackedProducts}
        onOpenHistory={product => setHistoryProduct(product)}
        onOpenLogs={product => setLogsProduct(product)}
      />

      {historyProduct && (
        <PriceHistoryModal
          product={historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}

      {logsProduct && (
        <ScrapeLogsModal
          product={logsProduct}
          onClose={() => setLogsProduct(null)}
        />
      )}
    </div>
  );
}
