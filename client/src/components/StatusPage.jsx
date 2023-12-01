import { useEffect, useState } from 'react';
import { COMPONENT_LABEL, describeAffected, statusClass } from '../lib/status.js';
import { STATUS_LABEL } from '../lib/labels.js';

function PublicIncident({ incident }) {
  return (
    <article className="card">
      <h3>{incident.title}</h3>
      <p className="note">
        {STATUS_LABEL[incident.status]} since {incident.startedAt.slice(0, 16).replace('T', ' ')} UTC
        {incident.affected.length > 0 && <> &middot; {incident.affected.map(describeAffected).join(', ')}</>}
      </p>
      <ul className="public-updates">
        {incident.updates.map((u) => (
          <li key={u.at + u.message}>
            <strong>{STATUS_LABEL[u.status]}</strong> <span className="note">{u.at.slice(11, 16)} UTC</span>
            <p>{u.message}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function StatusPage({ api }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.getStatus().then(
        (r) => {
          if (!cancelled) {
            setPage(r);
            setError(null);
          }
        },
        (err) => !cancelled && setError(err.message),
      );
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api]);

  if (error && !page) return <p className="error">Status is unavailable right now: {error}</p>;
  if (!page) return <p>Loading status...</p>;

  return (
    <section>
      <div className={`banner ${statusClass(page.overall.status)}`}>{page.overall.label}</div>
      {page.active.map((incident) => (
        <PublicIncident key={incident.id} incident={incident} />
      ))}
      <ul className="services">
        {page.services.map((service) => (
          <li key={service.id} className="card">
            <div className="service-head">
              <strong>{service.name}</strong>
              <span className={`pill ${statusClass(service.status)}`}>{COMPONENT_LABEL[service.status]}</span>
            </div>
            <ul className="components">
              {service.components.map((c) => (
                <li key={c.id}>
                  {c.name}
                  <span className={`pill ${statusClass(c.status)}`}>{COMPONENT_LABEL[c.status]}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {page.recent.length > 0 && <h2>Past incidents</h2>}
      {page.recent.map((incident) => (
        <PublicIncident key={incident.id} incident={incident} />
      ))}
    </section>
  );
}
