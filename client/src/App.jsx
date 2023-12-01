import { useEffect, useMemo, useReducer, useState } from 'react';
import { createApi } from './lib/api.js';
import { filtersReducer, initialFilters } from './lib/filters.js';
import { parseHash } from './lib/route.js';
import FilterBar from './components/FilterBar.jsx';
import IncidentForm from './components/IncidentForm.jsx';
import IncidentDetail from './components/IncidentDetail.jsx';
import IncidentList from './components/IncidentList.jsx';
import StatusPage from './components/StatusPage.jsx';

function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const api = useMemo(() => createApi(), []);
  const route = useHashRoute();
  const [filters, dispatch] = useReducer(filtersReducer, initialFilters);
  const [data, setData] = useState({ incidents: [], total: 0 });
  const [services, setServices] = useState([]);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api.listServices().then((r) => setServices(r.services), () => setServices([]));
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    // Wait a beat after the last keystroke so typing doesn't fire a request per letter.
    const timer = setTimeout(() => {
      api
        .listIncidents({ q: filters.q.trim(), severity: filters.severity, status: filters.status })
        .then((r) => {
          if (!cancelled) {
            setData(r);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, filters, reload]);

  return (
    <main className="page">
      <header className="top">
        <h1>Incident tracker</h1>
        <nav>
          <a href="#/">Incidents</a>
          <a href="#/status">Public status page</a>
        </nav>
      </header>
      {route.name === 'status' && <StatusPage api={api} />}
      {route.name === 'list' && (
        <>
          <IncidentForm api={api} services={services} onCreated={() => setReload((n) => n + 1)} />
          <FilterBar filters={filters} dispatch={dispatch} />
          {error && <p className="error">Could not load incidents: {error}</p>}
          <IncidentList incidents={data.incidents} total={data.total} />
        </>
      )}
      {route.name === 'incident' && <IncidentDetail api={api} id={route.id} />}
      {route.name === 'not-found' && <p>That page does not exist. <a href="#/">Back to incidents</a></p>}
    </main>
  );
}
