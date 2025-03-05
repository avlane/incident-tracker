import { useEffect, useState } from 'react';
import { RANGES, rangeParams, summaryCards, weeklyBars } from '../lib/metrics.js';
import { SEVERITIES, SEVERITY_LABEL } from '../lib/labels.js';
import { formatDuration } from '../lib/format.js';

export default function MetricsPage({ api }) {
  const [rangeKey, setRangeKey] = useState('30d');
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setMetrics(null);
    api.getMetrics(rangeParams(rangeKey)).then(
      (r) => {
        if (!cancelled) {
          setMetrics(r.metrics);
          setError(null);
        }
      },
      (err) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, [api, rangeKey]);

  return (
    <section>
      <div className="row">
        <h2>Metrics</h2>
        <label>
          Period
          <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value)}>
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="error">Could not load metrics: {error}</p>}
      {!metrics && !error && <p>Loading...</p>}
      {metrics && (
        <>
          <div className="cards">
            {summaryCards(metrics).map((card) => (
              <div key={card.label} className="card stat">
                <div className="note">{card.label}</div>
                <div className="big">{card.value}</div>
                <div className="note">{card.detail}</div>
              </div>
            ))}
          </div>

          <h3>By severity</h3>
          <ul className="plain">
            {SEVERITIES.map((s) => (
              <li key={s}>
                {SEVERITY_LABEL[s]}: {metrics.bySeverity[s]}
              </li>
            ))}
          </ul>

          <h3>By week</h3>
          <table className="weeks">
            <thead>
              <tr>
                <th>Week of</th>
                <th>Opened</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {weeklyBars(metrics.weekly).map((w) => (
                <tr key={w.weekStart}>
                  <td>{w.weekStart}</td>
                  <td>
                    <span className="bar opened" style={{ width: `${w.openedPct}%` }} /> {w.opened}
                  </td>
                  <td>
                    <span className="bar resolved" style={{ width: `${w.resolvedPct}%` }} /> {w.resolved}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {metrics.byService.length > 0 && (
            <>
              <h3>By service</h3>
              <ul className="plain">
                {metrics.byService.map((s) => (
                  <li key={s.serviceId}>
                    {s.serviceId}: {s.incidents} incident{s.incidents === 1 ? '' : 's'}, {formatDuration(s.resolvedMs)} to resolve in total
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
