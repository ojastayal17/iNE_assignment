/**
 * API client for the backend.
 * All fetch calls go through here for consistent error handling.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const url = `${API_URL}${path}`;
  
  const res = await fetch(url, {
    cache: 'no-store', // Prevent browser caching of API responses
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data;
}

// Product endpoints
export const searchProducts = (query) =>
  request(`/api/products/search?q=${encodeURIComponent(query)}`);

export const getTrackedProducts = () =>
  request('/api/products/tracked');

export const trackProduct = (product) =>
  request('/api/products/track', {
    method: 'POST',
    body: JSON.stringify(product),
  });

export const untrackProduct = (id) =>
  request(`/api/products/track/${id}`, { method: 'DELETE' });

export const getProduct = (id) =>
  request(`/api/products/${id}`);

// History endpoints
export const getPriceHistory = (productId, limit = 100) =>
  request(`/api/history/${productId}?limit=${limit}`);

export const getScrapeLogs = (productId, limit = 50) =>
  request(`/api/history/logs/${productId}?limit=${limit}`);

// Scrape endpoints
export const triggerScrape = () =>
  request('/api/scrape/trigger', { 
    method: 'POST',
    headers: { 'X-Cron-Secret': import.meta.env.VITE_CRON_SECRET || 'your-random-cron-secret' }
  });

export const scrapeProduct = (id) =>
  request(`/api/scrape/product/${id}`, { method: 'POST' });

export const getScrapeStatus = () =>
  request('/api/scrape/status');

export default {
  searchProducts,
  getTrackedProducts,
  trackProduct,
  untrackProduct,
  getProduct,
  getPriceHistory,
  getScrapeLogs,
  triggerScrape,
  scrapeProduct,
  getScrapeStatus,
};
