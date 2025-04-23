// Action items live inside each incident's postmortem. This flattens them into
// one list so follow-ups don't get lost once the incident is closed.

export function collectActionItems(incidents, { owner, overdueOnly = false, now }) {
  const today = now.slice(0, 10);
  const items = [];
  for (const incident of incidents) {
    for (const item of incident.postmortem?.actionItems ?? []) {
      items.push({
        incidentId: incident.id,
        incidentTitle: incident.title,
        action: item.action,
        owner: item.owner ?? null,
        due: item.due ?? null,
        overdue: Boolean(item.due) && item.due < today,
      });
    }
  }
  return items
    .filter((i) => !owner || (i.owner ?? '').toLowerCase() === owner.toLowerCase())
    .filter((i) => !overdueOnly || i.overdue)
    // soonest due date first; items without a date go last
    .sort((a, b) => (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99') || a.incidentId.localeCompare(b.incidentId));
}
