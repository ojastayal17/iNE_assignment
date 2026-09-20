import { useState, useEffect, useRef, useCallback } from 'react';
import { searchProducts, trackProduct } from '../api/client';

export default function SearchBar({ onProductTracked }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [trackingId, setTrackingId] = useState(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Debounced search
  const doSearch = useCallback(async (q) => {
    if (q.trim().length < 1) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setLoading(true);
    try {
      const data = await searchProducts(q.trim());
      setResults(data.products || []);
      setShowResults(true);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleTrack = async (product) => {
    setTrackingId(product.store_product_id);
    try {
      await trackProduct({
        storeProductId: product.store_product_id,
        name: product.name,
        brand: product.brand,
        category: product.category,
      });
      // Update the isTracked state in results
      setResults((prev) =>
        prev.map((p) =>
          p.store_product_id === product.store_product_id
            ? { ...p, isTracked: true }
            : p
        )
      );
      onProductTracked?.();
    } catch (err) {
      console.error('Track failed:', err);
    } finally {
      setTrackingId(null);
    }
  };

  return (
    <div className="search-container" ref={containerRef}>
      <div className="search-input-wrap">
        <span className="search-icon">🔍</span>
        <input
          id="product-search"
          type="text"
          className="search-input"
          placeholder="Search products by name, brand, or category..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          autoComplete="off"
        />
      </div>

      {showResults && (
        <div className="search-results">
          {loading && (
            <div className="search-loading">
              <span className="loading-spinner" /> Searching store...
            </div>
          )}

          {!loading && results.length === 0 && query.trim().length > 0 && (
            <div className="search-empty">
              No products found for "{query}". Try a different search term.
            </div>
          )}

          {!loading &&
            results.map((product) => (
              <div key={product.store_product_id} className="search-result-item">
                <div className="search-result-info">
                  <div className="search-result-name">{product.name}</div>
                  <div className="search-result-meta">
                    {product.category && <span>{product.category}</span>}
                    {product.brand && <span> · {product.brand}</span>}
                    <span> · ID: {product.store_product_id}</span>
                  </div>
                </div>
                <div className="search-result-actions">
                  {product.isTracked ? (
                    <span className="btn btn-success btn-sm" style={{ cursor: 'default' }}>
                      ✓ Tracked
                    </span>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleTrack(product)}
                      disabled={trackingId === product.store_product_id}
                    >
                      {trackingId === product.store_product_id ? (
                        <span className="loading-spinner" style={{ width: 14, height: 14 }} />
                      ) : (
                        '+ Track'
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
