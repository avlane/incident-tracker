import { STATUS_LABELS } from './labels.js';

// An Atom 1.0 feed of the public status page: one entry per public update, newest first.
// Input is the object buildStatusPage returns, so nothing internal can leak in here.

export function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // characters XML 1.0 cannot carry at all
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
}

export function buildAtomFeed(page, { baseUrl, title = 'Service status' }) {
  const entries = [];
  for (const incident of [...page.active, ...page.recent]) {
    incident.updates.forEach((update, i) => {
      // updates are stored newest first; number them oldest first so ids stay stable
      const n = incident.updates.length - i;
      entries.push({
        id: `tag:incident-tracker,2023:${incident.id}/${n}`,
        title: `[${STATUS_LABELS[update.status] ?? update.status}] ${incident.title}`,
        updated: update.at,
        text: update.message,
      });
    });
  }
  entries.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.id < b.id ? 1 : -1));
  const updated = entries[0]?.updated ?? page.generatedAt;
  const link = `${baseUrl.replace(/\/$/, '')}/#/status`;

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${xmlEscape(title)}</title>`,
    `  <id>tag:incident-tracker,2023:status</id>`,
    `  <updated>${xmlEscape(updated)}</updated>`,
    `  <link href="${xmlEscape(link)}"/>`,
  ];
  for (const entry of entries) {
    lines.push(
      '  <entry>',
      `    <id>${xmlEscape(entry.id)}</id>`,
      `    <title>${xmlEscape(entry.title)}</title>`,
      `    <updated>${xmlEscape(entry.updated)}</updated>`,
      `    <link href="${xmlEscape(link)}"/>`,
      `    <content type="text">${xmlEscape(entry.text)}</content>`,
      '  </entry>',
    );
  }
  lines.push('</feed>', '');
  return lines.join('\n');
}
