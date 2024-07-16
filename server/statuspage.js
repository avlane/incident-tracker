// Builds the public status page from services and incidents. Pure: give it the
// data and a timestamp, get back exactly what the page shows. Anything internal
// (commanders, internal updates, private incidents) is dropped here, in one
// place, so no handler can forget to.

export const COMPONENT_STATUSES = ['operational', 'degraded', 'partial_outage', 'major_outage'];

const OVERALL_LABEL = {
  operational: 'All systems operational',
  degraded: 'Some systems are slow',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
};

const worst = (a, b) => (COMPONENT_STATUSES.indexOf(a) >= COMPONENT_STATUSES.indexOf(b) ? a : b);

export function toPublicIncident(incident, services) {
  const updates = incident.updates
    .filter((u) => u.visibility !== 'internal')
    .map((u) => ({ at: u.at, status: u.status, message: u.message }))
    .reverse();
  return {
    id: incident.id,
    title: incident.title,
    status: incident.status,
    startedAt: incident.createdAt,
    resolvedAt: incident.resolvedAt,
    affected: incident.affected.map((a) => {
      const service = services.find((s) => s.id === a.serviceId);
      const component = service?.components.find((c) => c.id === a.componentId);
      return {
        service: service ? service.name : a.serviceId,
        component: component ? component.name : null,
        impact: a.impact,
      };
    }),
    updates,
  };
}

export function buildStatusPage({ services, incidents, now, historyDays = 14 }) {
  const visible = incidents.filter((i) => i.public !== false);
  const active = visible.filter((i) => i.status !== 'resolved');
  const cutoff = Date.parse(now) - historyDays * 86_400_000;
  const recent = visible
    .filter((i) => i.status === 'resolved' && Date.parse(i.resolvedAt) >= cutoff)
    .sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1));

  const serviceRows = services
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((service) => {
      let serviceLevel = 'operational';
      const byComponent = new Map(service.components.map((c) => [c.id, 'operational']));
      for (const incident of active) {
        for (const a of incident.affected) {
          if (a.serviceId !== service.id) continue;
          if (a.componentId && byComponent.has(a.componentId)) {
            byComponent.set(a.componentId, worst(byComponent.get(a.componentId), a.impact));
          } else {
            serviceLevel = worst(serviceLevel, a.impact);
          }
        }
      }
      const components = service.components.map((c) => ({
        id: c.id,
        name: c.name,
        status: worst(byComponent.get(c.id), serviceLevel),
      }));
      const status = components.reduce((acc, c) => worst(acc, c.status), serviceLevel);
      return { id: service.id, name: service.name, description: service.description, status, components };
    });

  const overall = serviceRows.reduce((acc, s) => worst(acc, s.status), 'operational');
  return {
    generatedAt: now,
    overall: { status: overall, label: OVERALL_LABEL[overall] },
    services: serviceRows,
    active: active.map((i) => toPublicIncident(i, services)),
    recent: recent.map((i) => toPublicIncident(i, services)),
  };
}
