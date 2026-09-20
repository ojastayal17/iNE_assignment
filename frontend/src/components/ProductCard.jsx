import { Link } from 'react-router-dom';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

export default function ProductCard({ product, onUntrack }) {
  const { latestPrice, latestLog, recentPrices, historyCount } = product;

  const price = latestPrice?.price;
  const mrp = latestPrice?.mrp;
  const discount = latestPrice?.discount_pct;
  const stock = latestPrice?.stock;
  const stockStatus = latestPrice?.stock_status;
  const currency = latestPrice?.currency || 'INR';

  const formatPrice = (val) => {
    if (!val) return '—';
    return currency === 'INR' ? `₹${Number(val).toLocaleString('en-IN')}` : `$${val}`;
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const sparkData = (recentPrices || []).map((p) => ({
    price: parseFloat(p.price),
  }));

  return (
    <div className="product-card fade-up">
      <Link
        to={`/product/${product.id}`}
        style={{ textDecoration: 'none', color: 'inherit', flex: 1 }}
      >
        <div className="product-card-header">
          <div>
            <div className="product-card-title">{product.name}</div>
            {product.brand && (
              <div className="product-card-brand">{product.brand}</div>
            )}
          </div>
          {product.category && (
            <span className="product-card-category">{product.category}</span>
          )}
        </div>

        <div className="product-card-price-row">
          <span className="product-card-price">{formatPrice(price)}</span>
          {mrp && parseFloat(mrp) > parseFloat(price) && (
            <span className="product-card-mrp">{formatPrice(mrp)}</span>
          )}
          {discount && (
            <span className="product-card-discount">{discount}% off</span>
          )}
        </div>

        <div className="product-card-stock">
          {stockStatus === 'in-stock' ? (
            <span className="stock-in">● In Stock{stock > 0 ? ` (${stock})` : ''}</span>
          ) : stockStatus === 'out-of-stock' ? (
            <span className="stock-out">● Out of Stock</span>
          ) : (
            <span style={{ color: 'var(--text-dim)' }}>● Unknown</span>
          )}
        </div>

        {sparkData.length > 1 && (
          <div className="sparkline-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="var(--accent-blue)"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Link>

      <div className="product-card-footer">
        <div className="product-card-meta">
          {historyCount > 0 && <span>{historyCount} data points</span>}
          {latestLog && (
            <span>
              {' · '}
              Last scraped {formatTime(latestLog.scraped_at)}
              {' · '}
              <span
                className={`status-badge status-${latestLog.status}`}
                style={{ fontSize: '0.7rem' }}
              >
                {latestLog.status}
              </span>
            </span>
          )}
        </div>
        <button
          className="btn btn-danger btn-sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUntrack?.(product.id);
          }}
          title="Stop tracking"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
