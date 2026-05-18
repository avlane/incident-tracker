import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { createApi } from './lib/api.js';
import { filtersReducer, initialFilters } from './lib/filters.js';
import { parseHash } from './lib/route.js';
import { canRespond, initialSession, sessionReducer } from './lib/session.js';
import { AuthContext } from './components/AuthContext.jsx';
import FilterBar from './components/FilterBar.jsx';
import IncidentDetail from './components/IncidentDetail.jsx';
import IncidentForm from './components/IncidentForm.jsx';
import IncidentList from './components/IncidentList.jsx';
import Login from './components/Login.jsx';
import MetricsPage from './components/MetricsPage.jsx';
import OnCallPanel from './components/OnCallPanel.jsx';
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

function Incidents({ api, user }) {
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
    <>
      <OnCallPanel api={api} />
      {canRespond(user) && <IncidentForm api={api} services={services} onCreated={() => setReload((n) => n + 1)} />}
      <FilterBar filters={filters} dispatch={dispatch} />
      {error && <p className="error">Could not load incidents: {error}</p>}
      <IncidentList incidents={data.incidents} total={data.total} />
    </>
  );
}

export default function App() {
  const [session, dispatchSession] = useReducer(sessionReducer, initialSession);
  const onUnauthorized = useCallback(() => dispatchSession({ type: 'expired' }), []);
  const api = useMemo(() => createApi({ onUnauthorized }), [onUnauthorized]);
  const route = useHashRoute();

  useEffect(() => {
    api.me().then(
      (r) => dispatchSession({ type: 'loaded', user: r.user }),
      () => dispatchSession({ type: 'loaded', user: null }),
    );
  }, [api]);

  async function signOut() {
    await api.logout().catch(() => {});
    dispatchSession({ type: 'signed_out' });
  }

  const publicStatus = route.name === 'status';
  let body;
  if (publicStatus) body = <StatusPage api={api} />;
  else if (session.status === 'loading') body = <p>Loading...</p>;
  else if (session.status === 'anonymous') {
    body = <Login api={api} notice={session.notice} onSignedIn={(user) => dispatchSession({ type: 'signed_in', user })} />;
  } else if (route.name === 'incident') body = <IncidentDetail api={api} id={route.id} />;
  else if (route.name === 'metrics') body = <MetricsPage api={api} />;
  else if (route.name === 'list') body = <Incidents api={api} user={session.user} />;
  else
    body = (
      <p>
        That page does not exist. <a href="#/">Back to incidents</a>
      </p>
    );

  return (
    <AuthContext value={{ user: session.user }}>
      <main className="page">
        {/* The app routes on the URL hash, so a plain #main link would navigate away. Move focus instead. */}
        <a
          className="skip"
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('content')?.focus();
          }}
        >
          Skip to content
        </a>
        <header className="top">
          <h1>Incident tracker</h1>
          <nav>
            <a href="#/">Incidents</a>
            <a href="#/metrics">Metrics</a>
            <a href="#/status">Public status page</a>
            {session.user && (
              <>
                <span className="who">{session.user.name}</span>
                <button type="button" className="link" onClick={signOut}>
                  Sign out
                </button>
              </>
            )}
          </nav>
        </header>
        <div id="content" tabIndex={-1}>
          {body}
        </div>
      </main>
    </AuthContext>
  );
}
