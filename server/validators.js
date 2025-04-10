import { ROLES } from './auth.js';
import { IMPACTS, SEVERITIES, STATUSES } from './incidents.js';
import { webhookUrlProblem } from './urlguard.js';
import { EVENTS } from './webhooks.js';

// Validators return { value, errors }. `value` is the cleaned input and is
// only meaningful when `errors` is empty.

function text(input, field, { required = false, max = 200 } = {}, errors) {
  const raw = input[field];
  if (raw === undefined || raw === null || raw === '') {
    if (required) errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (typeof raw !== 'string') {
    errors.push({ field, message: `${field} must be a string` });
    return undefined;
  }
  const value = raw.trim();
  if (required && value === '') {
    errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (value.length > max) {
    errors.push({ field, message: `${field} must be at most ${max} characters` });
    return undefined;
  }
  return value;
}

function affectedList(input, errors) {
  if (input.affected === undefined) return undefined;
  if (!Array.isArray(input.affected) || input.affected.length > 20) {
    errors.push({ field: 'affected', message: 'affected must be a list of at most 20 entries' });
    return undefined;
  }
  const out = [];
  input.affected.forEach((entry, i) => {
    const ok =
      entry &&
      typeof entry.serviceId === 'string' &&
      entry.serviceId !== '' &&
      IMPACTS.includes(entry.impact);
    if (!ok) {
      errors.push({
        field: `affected[${i}]`,
        message: `needs a serviceId and an impact of ${IMPACTS.join(', ')}`,
      });
      return;
    }
    const item = { serviceId: entry.serviceId, impact: entry.impact };
    if (typeof entry.componentId === 'string' && entry.componentId !== '') item.componentId = entry.componentId;
    out.push(item);
  });
  return out;
}

export function validateIncidentInput(input) {
  const errors = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ field: '', message: 'body must be an object' }] };
  }
  const value = {};
  value.title = text(input, 'title', { required: true, max: 140 }, errors);
  value.summary = text(input, 'summary', { max: 2000 }, errors);
  value.commander = text(input, 'commander', { max: 80 }, errors);
  if (!SEVERITIES.includes(input.severity)) {
    errors.push({ field: 'severity', message: `severity must be one of ${SEVERITIES.join(', ')}` });
  } else {
    value.severity = input.severity;
  }
  value.affected = affectedList(input, errors);
  if (input.public !== undefined) {
    if (typeof input.public === 'boolean') value.public = input.public;
    else errors.push({ field: 'public', message: 'public must be true or false' });
  }
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return { value, errors };
}

export function validateUpdateInput(input) {
  const errors = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ field: '', message: 'body must be an object' }] };
  }
  const value = {};
  value.message = text(input, 'message', { required: true, max: 2000 }, errors);
  value.author = text(input, 'author', { max: 80 }, errors);
  if (input.status !== undefined) {
    if (STATUSES.includes(input.status)) value.status = input.status;
    else errors.push({ field: 'status', message: `status must be one of ${STATUSES.join(', ')}` });
  }
  if (input.severity !== undefined) {
    if (SEVERITIES.includes(input.severity)) value.severity = input.severity;
    else errors.push({ field: 'severity', message: `severity must be one of ${SEVERITIES.join(', ')}` });
  }
  if (input.visibility !== undefined) {
    if (input.visibility === 'public' || input.visibility === 'internal') value.visibility = input.visibility;
    else errors.push({ field: 'visibility', message: 'visibility must be public or internal' });
  }
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return { value, errors };
}

export function validateServiceInput(input, { partial = false } = {}) {
  const errors = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ field: '', message: 'body must be an object' }] };
  }
  const value = {};
  value.name = text(input, 'name', { required: !partial, max: 80 }, errors);
  value.description = text(input, 'description', { max: 300 }, errors);
  if (input.components !== undefined) {
    const list = input.components;
    const ok =
      Array.isArray(list) &&
      list.length <= 30 &&
      list.every((c) => typeof c === 'string' && c.trim() !== '' && c.trim().length <= 80);
    if (ok) value.components = list.map((c) => c.trim());
    else errors.push({ field: 'components', message: 'components must be a list of up to 30 names' });
  }
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return { value, errors };
}

function isoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

export function validateScheduleInput(input) {
  const errors = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ field: '', message: 'body must be an object' }] };
  }
  const value = {};
  value.name = text(input, 'name', { required: true, max: 80 }, errors);
  const members = input.members;
  if (
    Array.isArray(members) &&
    members.length >= 1 &&
    members.length <= 20 &&
    members.every((m) => typeof m === 'string' && m.trim() !== '' && m.trim().length <= 80)
  ) {
    value.members = members.map((m) => m.trim());
    if (new Set(value.members).size !== value.members.length) {
      errors.push({ field: 'members', message: 'members must be unique' });
    }
  } else {
    errors.push({ field: 'members', message: 'members must be a list of 1 to 20 names' });
  }
  if (isoDate(input.startsAt)) value.startsAt = new Date(input.startsAt).toISOString();
  else errors.push({ field: 'startsAt', message: 'startsAt must be an ISO date-time' });
  if (input.rotationHours !== undefined) {
    if (Number.isInteger(input.rotationHours) && input.rotationHours >= 1 && input.rotationHours <= 24 * 30) {
      value.rotationHours = input.rotationHours;
    } else {
      errors.push({ field: 'rotationHours', message: 'rotationHours must be a whole number from 1 to 720' });
    }
  }
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return { value, errors };
}

export function validateOverrideInput(input) {
  const errors = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ field: '', message: 'body must be an object' }] };
  }
  const value = {};
  value.who = text(input, 'who', { required: true, max: 80 }, errors);
  if (isoDate(input.from)) value.from = new Date(input.from).toISOString();
  else errors.push({ field: 'from', message: 'from must be an ISO date-time' });
  if (isoDate(input.to)) value.to = new Date(input.to).toISOString();
  else errors.push({ field: 'to', message: 'to must be an ISO date-time' });
  if (value.from && value.to && Date.parse(value.to) <= Date.parse(value.from)) {
    errors.push({ field: 'to', message: 'to must be after from' });
  }
  return { value, errors };
}

export function validateUserInput(input) {
  const errors = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ field: '', message: 'body must be an object' }] };
  }
  const value = {};
  value.name = text(input, 'name', { required: true, max: 80 }, errors);
  const email = text(input, 'email', { required: true, max: 200 }, errors);
  if (email !== undefined) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) value.email = email.toLowerCase();
    else errors.push({ field: 'email', message: 'email is not valid' });
  }
  if (ROLES.includes(input.role)) value.role = input.role;
  else errors.push({ field: 'role', message: `role must be one of ${ROLES.join(', ')}` });
  if (typeof input.password === 'string') value.password = input.password;
  else errors.push({ field: 'password', message: 'password is required' });
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return { value, errors };
}

export function validateWebhookInput(input, { partial = false, allowPrivate = false } = {}) {
  const errors = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ field: '', message: 'body must be an object' }] };
  }
  const value = {};
  if (input.url !== undefined || !partial) {
    const problem = typeof input.url === 'string' ? webhookUrlProblem(input.url, { allowPrivate }) : 'url is required';
    if (problem) errors.push({ field: 'url', message: problem });
    else value.url = new URL(input.url).toString();
  }
  value.description = text(input, 'description', { max: 200 }, errors);
  if (input.events !== undefined) {
    const ok = Array.isArray(input.events) && input.events.every((e) => EVENTS.includes(e));
    if (ok) value.events = [...new Set(input.events)];
    else errors.push({ field: 'events', message: `events must be a list drawn from ${EVENTS.join(', ')}` });
  }
  if (input.active !== undefined) {
    if (typeof input.active === 'boolean') value.active = input.active;
    else errors.push({ field: 'active', message: 'active must be true or false' });
  }
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return { value, errors };
}

function stringList(input, field, errors, { maxItems = 20, maxLength = 500 } = {}) {
  const list = input[field];
  if (list === undefined) return [];
  const ok = Array.isArray(list) && list.length <= maxItems && list.every((x) => typeof x === 'string' && x.trim() !== '' && x.trim().length <= maxLength);
  if (!ok) {
    errors.push({ field, message: `${field} must be a list of up to ${maxItems} non-empty strings of at most ${maxLength} characters` });
    return [];
  }
  return list.map((x) => x.trim());
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function validatePostmortemInput(input) {
  const errors = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ field: '', message: 'body must be an object' }] };
  }
  const value = {
    rootCause: text(input, 'rootCause', { max: 5000 }, errors) ?? '',
    detection: text(input, 'detection', { max: 2000 }, errors) ?? '',
    wentWell: stringList(input, 'wentWell', errors),
    wentPoorly: stringList(input, 'wentPoorly', errors),
    actionItems: [],
  };
  if (input.actionItems !== undefined) {
    if (!Array.isArray(input.actionItems) || input.actionItems.length > 30) {
      errors.push({ field: 'actionItems', message: 'actionItems must be a list of at most 30 items' });
    } else {
      input.actionItems.forEach((item, i) => {
        const itemErrors = [];
        const action = item && typeof item === 'object' ? text(item, 'action', { required: true, max: 300 }, itemErrors) : undefined;
        const owner = item && typeof item === 'object' ? text(item, 'owner', { max: 80 }, itemErrors) : undefined;
        const due = item?.due;
        if (due !== undefined && due !== '' && !(typeof due === 'string' && DATE_ONLY.test(due) && !Number.isNaN(Date.parse(due)))) {
          itemErrors.push({ message: 'due must be a date like 2025-05-30' });
        }
        if (!item || typeof item !== 'object' || itemErrors.length > 0) {
          errors.push({ field: `actionItems[${i}]`, message: itemErrors[0]?.message ?? 'must be an object with an action' });
          return;
        }
        const entry = { action };
        if (owner) entry.owner = owner;
        if (due) entry.due = due;
        value.actionItems.push(entry);
      });
    }
  }
  return { value, errors };
}
