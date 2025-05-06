// Form helpers for the postmortem editor. Lists are edited as one item per line.

export const linesToList = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);

export const listToLines = (list = []) => list.join('\n');

export function emptyPostmortemForm(incident) {
  const pm = incident.postmortem ?? {};
  return {
    rootCause: pm.rootCause ?? '',
    detection: pm.detection ?? '',
    wentWell: listToLines(pm.wentWell),
    wentPoorly: listToLines(pm.wentPoorly),
    actionItems: (pm.actionItems ?? []).map((i) => ({ action: i.action, owner: i.owner ?? '', due: i.due ?? '' })),
  };
}

export const blankActionItem = () => ({ action: '', owner: '', due: '' });

// Rows left completely blank are dropped, not reported as errors.
const isBlank = (item) => item.action.trim() === '' && item.owner.trim() === '' && item.due.trim() === '';

export function validatePostmortemForm(form) {
  const errors = {};
  form.actionItems.forEach((item, i) => {
    if (isBlank(item)) return;
    if (item.action.trim() === '') errors[`actionItems.${i}`] = 'Describe the action.';
    else if (item.due && !/^\d{4}-\d{2}-\d{2}$/.test(item.due)) errors[`actionItems.${i}`] = 'Use a date like 2025-05-30.';
  });
  if (form.rootCause.length > 5000) errors.rootCause = 'The root cause is limited to 5000 characters.';
  return errors;
}

export function toPostmortemPayload(form) {
  return {
    rootCause: form.rootCause.trim(),
    detection: form.detection.trim(),
    wentWell: linesToList(form.wentWell),
    wentPoorly: linesToList(form.wentPoorly),
    actionItems: form.actionItems
      .filter((item) => !isBlank(item))
      .map((item) => {
        const out = { action: item.action.trim() };
        if (item.owner.trim()) out.owner = item.owner.trim();
        if (item.due.trim()) out.due = item.due.trim();
        return out;
      }),
  };
}
