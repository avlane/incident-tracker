import { hrefFor } from '../lib/route.js';
import { incidentDuration, relativeTime } from '../lib/format.js';
import { SeverityBadge, StatusBadge } from './Badges.jsx';

export default function IncidentList({ incidents, total }) {
  if (incidents.length === 0) {
    return <p className="empty">No incidents match. That is usually good news.</p>;
  }
  return (
    <>
      <ul className="incident-list">
        {incidents.map((incident) => (
          <li key={incident.id}>
            <a href={hrefFor({ name: 'incident', id: incident.id })}>
              <span className="id">{incident.id}</span>
              <span className="title">{incident.title}</span>
            </a>
            <div className="meta">
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
              <span>opened {relativeTime(incident.createdAt)}</span>
              <span>lasted {incidentDuration(incident)}</span>
              {incident.commander && <span>led by {incident.commander}</span>}
            </div>
          </li>
        ))}
      </ul>
      <p className="count">
        Showing {incidents.length} of {total}
      </p>
    </>
  );
}
