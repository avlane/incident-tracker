import { useEffect, useState } from 'react';
import { incidentDuration } from '../lib/format.js';
import { IMPACT_LABEL } from '../lib/labels.js';
import { SeverityBadge, StatusBadge } from './Badges.jsx';
import { canRespond } from '../lib/session.js';
import { useUser } from './AuthContext.jsx';
import PostmortemEditor from './PostmortemEditor.jsx';
import Timeline from './Timeline.jsx';
import UpdateForm from './UpdateForm.jsx';

export default function IncidentDetail({ api, id }) {
  const user = useUser();
  const [incident, setIncident] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIncident(null);
    setError(null);
    api.getIncident(id).then(
      (r) => !cancelled && setIncident(r.incident),
      (err) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  if (error) {
    return (
      <p className="error">
        Could not load {id}: {error} <a href="#/">Back</a>
      </p>
    );
  }
  if (!incident) return <p>Loading...</p>;

  return (
    <article>
      <p>
        <a href="#/">All incidents</a>
      </p>
      <h2>
        {incident.id} {incident.title}
      </h2>
      <div className="meta">
        <SeverityBadge severity={incident.severity} />
        <StatusBadge status={incident.status} />
        <span>{incident.resolvedAt ? 'resolved after' : 'open for'} {incidentDuration(incident)}</span>
        {incident.commander && <span>led by {incident.commander}</span>}
      </div>
      {incident.affected.length > 0 && (
        <ul className="affected">
          {incident.affected.map((a) => (
            <li key={`${a.serviceId}/${a.componentId ?? ''}`}>
              {a.serviceId}
              {a.componentId ? ` / ${a.componentId}` : ''}: {IMPACT_LABEL[a.impact]}
            </li>
          ))}
        </ul>
      )}
      {canRespond(user) && <UpdateForm api={api} incident={incident} onUpdated={setIncident} />}
      <Timeline incident={incident} />
      {canRespond(user) && incident.status === 'resolved' && (
        <PostmortemEditor
          api={api}
          incident={incident}
          onSaved={(postmortem) => setIncident({ ...incident, postmortem })}
        />
      )}
      <p>
        <a href={`/api/incidents/${encodeURIComponent(incident.id)}/postmortem`}>Download postmortem draft (Markdown)</a>
      </p>
    </article>
  );
}
