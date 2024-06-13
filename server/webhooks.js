import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Webhook payload signing. Receivers get two headers:
//
//   X-Incident-Event:      incident.updated
//   X-Incident-Signature:  t=1718000000,v1=<hex hmac-sha256>
//
// The signature covers `${t}.${raw body}` so a captured request can't be
// replayed with a new timestamp, and receivers should reject old timestamps.

export const EVENTS = ['incident.created', 'incident.updated', 'incident.resolved'];

export const SIGNATURE_HEADER = 'x-incident-signature';
export const EVENT_HEADER = 'x-incident-event';

export function generateSecret() {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

export function signPayload(secret, timestamp, body) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function signatureHeader(secret, body, nowMs) {
  const t = Math.floor(nowMs / 1000);
  return `t=${t},v1=${signPayload(secret, t, body)}`;
}

// What a receiver would run. Accepts several v1= values so a secret can be
// rotated without dropping events, and compares in constant time.
export function verifySignature({ secret, header, body, nowMs, toleranceSeconds = 300 }) {
  if (typeof header !== 'string') return false;
  const fields = header.split(',').map((part) => part.trim().split('='));
  const t = Number(fields.find(([k]) => k === 't')?.[1]);
  if (!Number.isInteger(t)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - t) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(secret, t, body), 'hex');
  return fields
    .filter(([k]) => k === 'v1')
    .some(([, v]) => {
      const given = Buffer.from(v ?? '', 'hex');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

export function buildEvent(type, incident, at, id) {
  return { id, type, createdAt: at, data: { incident } };
}
