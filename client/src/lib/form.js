// Pure helpers behind the "open an incident" form.

export function emptyIncidentForm() {
  return { title: '', summary: '', severity: 'sev3', commander: '', serviceIds: [] };
}

export function validateIncidentForm(values) {
  const errors = {};
  const title = values.title.trim();
  if (title === '') errors.title = 'Give the incident a short title.';
  else if (title.length > 140) errors.title = 'Keep the title under 140 characters.';
  if (values.summary.trim().length > 2000) errors.summary = 'The summary is limited to 2000 characters.';
  if (values.commander.trim().length > 80) errors.commander = 'Names are limited to 80 characters.';
  return errors;
}

// Turns form state into the API payload. Selected services are recorded as
// degraded; responders refine the impact from the incident page.
export function toIncidentPayload(values) {
  const payload = { title: values.title.trim(), severity: values.severity };
  if (values.summary.trim()) payload.summary = values.summary.trim();
  if (values.commander.trim()) payload.commander = values.commander.trim();
  if (values.serviceIds.length > 0) {
    payload.affected = values.serviceIds.map((serviceId) => ({ serviceId, impact: 'degraded' }));
  }
  return payload;
}

// The API reports errors as [{ field, message }]; the form wants { field: message }.
export function fieldErrorsFromApi(details = []) {
  const out = {};
  for (const { field, message } of details) {
    const key = field.replace(/\[\d+\]$/, '');
    out[key] ??= message;
  }
  return out;
}
