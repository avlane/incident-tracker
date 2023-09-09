import { SEVERITIES, STATUSES, SEVERITY_LABEL, STATUS_LABEL } from '../lib/labels.js';
import { isFiltering } from '../lib/filters.js';

function Chips({ field, options, labels, selected, dispatch }) {
  return (
    <div className="chips" role="group" aria-label={field}>
      {options.map((value) => (
        <button
          key={value}
          type="button"
          className={selected.includes(value) ? 'chip on' : 'chip'}
          aria-pressed={selected.includes(value)}
          onClick={() => dispatch({ type: 'toggle', field, value })}
        >
          {labels[value]}
        </button>
      ))}
    </div>
  );
}

export default function FilterBar({ filters, dispatch }) {
  return (
    <section className="filters">
      <input
        type="search"
        placeholder="Search title, summary and updates"
        value={filters.q}
        onChange={(e) => dispatch({ type: 'set_q', value: e.target.value })}
      />
      <Chips field="severity" options={SEVERITIES} labels={SEVERITY_LABEL} selected={filters.severity} dispatch={dispatch} />
      <Chips field="status" options={STATUSES} labels={STATUS_LABEL} selected={filters.status} dispatch={dispatch} />
      {isFiltering(filters) && (
        <button type="button" className="link" onClick={() => dispatch({ type: 'reset' })}>
          Clear filters
        </button>
      )}
    </section>
  );
}
