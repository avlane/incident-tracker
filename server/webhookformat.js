import { STATUS_LABELS } from './labels.js';

// Webhook bodies come in two shapes: our own JSON event ("json", the default),
// or a message that Slack's incoming webhooks accept ("slack"). Chat tools
// that speak the same shape (Mattermost, for one) can use it too.

export const FORMATS = ['json', 'slack'];

// Slack's mrkdwn treats these three characters as control characters.
export const slackEscape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const HEADLINE = {
  'incident.created': 'New incident',
  'incident.updated': 'Incident update',
  'incident.resolved': 'Incident resolved',
};

function slackMessage(event) {
  if (event.type === 'webhook.ping') {
    return { text: 'incident-tracker: test event. This webhook is set up correctly.' };
  }
  const incident = event.data.incident;
  const latest = incident.updates[0]; // public views list updates newest first
  const status = STATUS_LABELS[incident.status] ?? incident.status;
  const headline = `${HEADLINE[event.type] ?? event.type}: ${incident.id} ${incident.title}`;
  const affected = incident.affected.map((a) => (a.component ? `${a.service} / ${a.component}` : a.service));
  const lines = [`*${slackEscape(headline)}*`, `Status: ${status}`];
  if (affected.length > 0) lines.push(`Affected: ${slackEscape(affected.join(', '))}`);
  if (latest) lines.push(slackEscape(latest.message));
  return {
    // `text` is the notification preview and the fallback for clients without blocks
    text: `${headline} (${status})`,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }],
  };
}

export function formatPayload(format, event) {
  return format === 'slack' ? slackMessage(event) : event;
}
