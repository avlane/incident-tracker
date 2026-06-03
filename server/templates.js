// Incident templates: saved starting points ("Database failover", "Third-party
// outage") so the person opening an incident at 3am types less. A template
// only provides defaults; anything the request says itself wins.

export function createTemplate(input, { id, now }) {
  return {
    id,
    name: input.name,
    title: input.title ?? '',
    summary: input.summary ?? '',
    severity: input.severity ?? null,
    labels: input.labels ?? [],
    affected: input.affected ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTemplate(template, input, { now }) {
  return { ...template, ...input, updatedAt: now };
}

// Merges a template under the request body. Returns a new object.
export function applyTemplate(template, body) {
  const merged = { ...body };
  if (merged.title === undefined || merged.title === '') {
    if (template.title) merged.title = template.title;
  }
  if (merged.summary === undefined || merged.summary === '') {
    if (template.summary) merged.summary = template.summary;
  }
  if (merged.severity === undefined && template.severity) merged.severity = template.severity;
  if (merged.affected === undefined && template.affected.length > 0) merged.affected = template.affected;
  // Labels add up: the template's plus whatever the request gave.
  const labels = [...template.labels, ...(Array.isArray(body.labels) ? body.labels : [])];
  if (labels.length > 0) merged.labels = labels;
  return merged;
}
