export default function ScrapeLog({ logs, successRate }) {
  if (!logs || logs.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-header">
          <h3 className="chart-title">Scrape Log</h3>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No scrape logs yet</div>
          <div className="empty-state-text">
            Logs will appear here after the scraper runs for the first time.
          </div>
        </div>
      </div>
    );
  }

  const formatTime = (ts) => {
    return new Date(ts).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (ms) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const statusIcon = (status) => {
    switch (status) {
      case 'success':
        return '✓';
      case 'retried':
        return '↻';
      case 'failed':
        return '✗';
      default:
        return '?';
    }
  };

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h3 className="chart-title">Scrape Log</h3>
        {successRate !== null && successRate !== undefined && (
          <span
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color:
                successRate >= 90
                  ? 'var(--success)'
                  : successRate >= 70
                  ? 'var(--warning)'
                  : 'var(--danger)',
            }}
          >
            {successRate}% success rate
          </span>
        )}
      </div>

      <div className="log-table-wrap">
        <table className="log-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Duration</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {formatTime(log.scraped_at)}
                </td>
                <td>
                  <span className={`status-badge status-${log.status}`}>
                    {statusIcon(log.status)} {log.status}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>{log.attempts}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                  {formatDuration(log.duration_ms)}
                </td>
                <td
                  style={{
                    maxWidth: 300,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: log.error_message ? 'var(--danger)' : 'var(--text-dim)',
                    fontSize: '0.82rem',
                  }}
                  title={log.error_message || ''}
                >
                  {log.error_message || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
