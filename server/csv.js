// RFC 4180 CSV output: CRLF line endings, fields containing commas, quotes or
// line breaks are quoted, and quotes inside a field are doubled.

// Spreadsheet programs run a cell that starts with = + - @ (or a tab or
// carriage return) as a formula. Titles and commander names are user input, so
// those cells get a leading apostrophe, which spreadsheets show as plain text.
// Numbers are exempt: a negative number is not a formula.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvField(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows, columns) {
  const lines = [columns.map((c) => csvField(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvField(c.value(row))).join(','));
  return lines.join('\r\n') + '\r\n';
}

export const INCIDENT_COLUMNS = [
  { header: 'id', value: (i) => i.id },
  { header: 'title', value: (i) => i.title },
  { header: 'severity', value: (i) => i.severity },
  { header: 'status', value: (i) => i.status },
  { header: 'commander', value: (i) => i.commander },
  { header: 'labels', value: (i) => (i.labels ?? []).join(' ') },
  { header: 'services', value: (i) => i.affected.map((a) => a.serviceId).join(' ') },
  { header: 'created_at', value: (i) => i.createdAt },
  { header: 'resolved_at', value: (i) => i.resolvedAt },
  {
    header: 'duration_seconds',
    value: (i) => (i.resolvedAt ? Math.round((Date.parse(i.resolvedAt) - Date.parse(i.createdAt)) / 1000) : ''),
  },
  { header: 'updates', value: (i) => i.updates.length },
];
