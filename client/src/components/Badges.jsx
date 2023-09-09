import { SEVERITY_LABEL, STATUS_LABEL } from '../lib/labels.js';

export function SeverityBadge({ severity }) {
  return <span className={`badge sev ${severity}`}>{SEVERITY_LABEL[severity] ?? severity}</span>;
}

export function StatusBadge({ status }) {
  return <span className={`badge status ${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}
