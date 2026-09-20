import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts';

export default function PriceChart({ history, summary }) {
  const [view, setView] = useState('price');

  if (!history || history.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-header">
          <h3 className="chart-title">Price History</h3>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">No data yet</div>
          <div className="empty-state-text">
            Price history will appear here after the first scrape.
          </div>
        </div>
      </div>
    );
  }

  const chartData = history.map((h) => ({
    time: new Date(h.scraped_at).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    price: parseFloat(h.price) || null,
    mrp: parseFloat(h.mrp) || null,
    stock: h.stock ?? null,
    fullTime: new Date(h.scraped_at).toLocaleString('en-IN'),
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          fontSize: '0.82rem',
        }}
      >
        <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
          {payload[0]?.payload?.fullTime}
        </div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, fontWeight: 600 }}>
            {p.name}: {p.name === 'Stock' ? p.value : `₹${p.value?.toLocaleString('en-IN')}`}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h3 className="chart-title">
          {view === 'price' ? 'Price History' : 'Stock History'}
        </h3>
        <div className="chart-toggle">
          <button
            className={`chart-toggle-btn ${view === 'price' ? 'active' : ''}`}
            onClick={() => setView('price')}
          >
            Price
          </button>
          <button
            className={`chart-toggle-btn ${view === 'stock' ? 'active' : ''}`}
            onClick={() => setView('stock')}
          >
            Stock
          </button>
        </div>
      </div>

      {summary && view === 'price' && (
        <div className="price-stats-row">
          <div className="price-stat">
            <div className="price-stat-value" style={{ color: 'var(--success)' }}>
              ₹{summary.minPrice?.toLocaleString('en-IN')}
            </div>
            <div className="price-stat-label">Lowest</div>
          </div>
          <div className="price-stat">
            <div className="price-stat-value">
              ₹{summary.avgPrice?.toLocaleString('en-IN')}
            </div>
            <div className="price-stat-label">Average</div>
          </div>
          <div className="price-stat">
            <div className="price-stat-value" style={{ color: 'var(--danger)' }}>
              ₹{summary.maxPrice?.toLocaleString('en-IN')}
            </div>
            <div className="price-stat-label">Highest</div>
          </div>
          <div className="price-stat">
            <div className="price-stat-value" style={{ color: 'var(--accent-blue)' }}>
              {summary.totalDataPoints}
            </div>
            <div className="price-stat-label">Data Points</div>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={300}>
        {view === 'price' ? (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-glass)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border-glass)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `₹${v}`}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--accent-blue)"
              fill="url(#priceGradient)"
              strokeWidth={2}
              name="Price"
              dot={chartData.length < 30}
            />
            {chartData.some((d) => d.mrp) && (
              <Line
                type="monotone"
                dataKey="mrp"
                stroke="var(--text-dim)"
                strokeDasharray="5 5"
                strokeWidth={1}
                dot={false}
                name="MRP"
              />
            )}
          </AreaChart>
        ) : (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-glass)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border-glass)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="stepAfter"
              dataKey="stock"
              stroke="var(--success)"
              fill="url(#stockGradient)"
              strokeWidth={2}
              name="Stock"
              dot={chartData.length < 30}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
