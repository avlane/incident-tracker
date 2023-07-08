import { formatDuration, formatUtc } from './time.js';

// Builds a Markdown postmortem skeleton from an incident. Everything the
// tracker knows is filled in (timeline, duration, impact); the parts only
// people can write are left as clearly marked prompts.

const IMPACT_LABEL = {
  degraded: 'degraded performance',
  partial_outage: 'partial outage',
  major_outage: 'major outage',
};

const STATUS_LABEL = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

function cell(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function describeAffected(incident, services) {
  return incident.affected.map((entry) => {
    const service = services.find((s) => s.id === entry.serviceId);
    const name = service ? service.name : entry.serviceId;
    const component = service?.components.find((c) => c.id === entry.componentId);
    const label = component ? `${name} / ${component.name}` : name;
    return { label, impact: IMPACT_LABEL[entry.impact] ?? entry.impact };
  });
}

export function generatePostmortem(incident, { services = [], now } = {}) {
  const start = Date.parse(incident.createdAt);
  const end = incident.resolvedAt ? Date.parse(incident.resolvedAt) : now ? Date.parse(now) : NaN;
  const duration = formatDuration(end - start);
  const affected = describeAffected(incident, services);
  const lines = [];

  lines.push(`# Postmortem: ${incident.id} ${oneLine(incident.title)}`, '');
  lines.push('| | |', '|---|---|');
  lines.push(`| Incident | ${incident.id} |`);
  lines.push(`| Severity | ${incident.severity.toUpperCase()} |`);
  lines.push(`| Status | ${STATUS_LABEL[incident.status]} |`);
  lines.push(`| Commander | ${cell(incident.commander ?? 'unassigned')} |`);
  lines.push(`| Started | ${formatUtc(incident.createdAt)} UTC |`);
  lines.push(`| Resolved | ${incident.resolvedAt ? `${formatUtc(incident.resolvedAt)} UTC` : 'still open'} |`);
  lines.push(`| Duration | ${incident.resolvedAt ? duration : `${duration} so far`} |`);
  lines.push('', '## Summary', '');
  lines.push(incident.summary ? incident.summary : '_No summary was recorded. Write two or three sentences on what happened._');

  lines.push('', '## Impact', '');
  if (affected.length === 0) {
    lines.push('_No services were marked as affected. Describe who noticed and what they saw._');
  } else {
    for (const a of affected) lines.push(`- ${a.label}: ${a.impact}`);
  }

  lines.push('', '## Timeline (UTC)', '');
  for (const update of incident.updates) {
    const who = update.author ? ` (${oneLine(update.author)})` : '';
    const label = update.kind === 'opened' ? 'Opened' : STATUS_LABEL[update.status];
    const [first, ...rest] = String(update.message).split(/\r?\n/);
    lines.push(`- ${formatUtc(update.at)} **${label}**${who}: ${first}`);
    for (const more of rest) lines.push(`  ${more}`);
  }

  lines.push('', '## Root cause', '', '_What actually broke, and why was it possible?_');
  lines.push('', '## Detection', '', '_How did we find out? Could we have found out sooner?_');
  lines.push('', '## What went well', '', '- ');
  lines.push('', '## What went poorly', '', '- ');
  lines.push('', '## Action items', '', '| Action | Owner | Due |', '|---|---|---|', '| | | |', '');
  return lines.join('\n');
}
