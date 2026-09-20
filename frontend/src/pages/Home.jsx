import { useState, useEffect, useCallback } from 'react';
import SearchBar from '../components/SearchBar';
import ProductCard from '../components/ProductCard';
import { getTrackedProducts, untrackProduct, triggerScrape, getScrapeStatus } from '../api/client';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [triggering, setTriggering] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const data = await getTrackedProducts();
      setProducts(data.products || []);
    } catch (err) {
      console.error('Failed to fetch tracked products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getScrapeStatus();
      setScrapeStatus(data);
    } catch {
      // Ignore status fetch errors
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchStatus();
  }, [fetchProducts, fetchStatus]);

  const handleUntrack = async (id) => {
    try {
      await untrackProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Failed to untrack:', err);
    }
  };

  const handleTriggerScrape = async () => {
    setTriggering(true);
    try {
      await triggerScrape();
      
      // Poll status until complete
      const poll = async () => {
        try {
          const status = await getScrapeStatus();
          setScrapeStatus(status);
          if (status.isRunning) {
            setTimeout(poll, 2000);
          } else {
            fetchProducts();
            setTriggering(false);
          }
        } catch {
          setTriggering(false);
        }
      };
      
      setTimeout(poll, 2000);
    } catch (err) {
      console.error('Failed to trigger scrape:', err);
      setTriggering(false);
    }
  };

  const totalProducts = products.length;
  const latestSuccessRate =
    products.length > 0
      ? products.filter((p) => p.latestLog?.status === 'success' || p.latestLog?.status === 'retried').length
      : 0;
  const totalDataPoints = products.reduce((sum, p) => sum + (p.historyCount || 0), 0);

  const formatTime = (ts) => {
    if (!ts) return 'Never';
    const d = new Date(ts);
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fade-in">
      {/* Search */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 'var(--space-sm)', fontSize: '1.8rem', fontWeight: 800 }}>
          Track Product Prices
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: 'var(--space-lg)', fontSize: '0.95rem' }}>
          Search the INE Mock Store and track products to monitor price changes over time
        </p>
        <SearchBar onProductTracked={fetchProducts} />
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value blue">{totalProducts}</div>
          <div className="stat-label">Tracked Products</div>
        </div>
        <div className="stat-card">
          <div className="stat-value green">
            {totalProducts > 0 ? `${latestSuccessRate}/${totalProducts}` : '—'}
          </div>
          <div className="stat-label">Last Scrape Success</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalDataPoints}</div>
          <div className="stat-label">Total Data Points</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '1rem', lineHeight: '2rem' }}>
            {formatTime(scrapeStatus?.lastScrapeTime)}
          </div>
          <div className="stat-label">Last Scrape</div>
        </div>
      </div>

      {/* Actions */}
      <div className="section-header">
        <div>
          <h2 className="section-title">Tracked Products</h2>
          <p className="section-subtitle">
            Products are scraped every 2 hours via scheduled cron job
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleTriggerScrape}
          disabled={triggering || scrapeStatus?.isRunning}
        >
          {triggering || scrapeStatus?.isRunning ? (
            <>
              <span className="loading-spinner" style={{ width: 16, height: 16 }} />
              Scraping...
            </>
          ) : (
            '⟳ Scrape Now'
          )}
        </button>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="loading-container">
          <span className="loading-spinner" />
          Loading tracked products...
        </div>
      ) : products.length === 0 ? (
        <div className="empty-state glass-card">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No products tracked yet</div>
          <div className="empty-state-text">
            Use the search bar above to find products from the INE Mock Store and start tracking their prices.
          </div>
        </div>
      ) : (
        <div className="products-grid">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onUntrack={handleUntrack}
            />
          ))}
        </div>
      )}
    </div>
  );
}
