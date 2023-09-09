import { useState } from 'react';
import { SEVERITIES, SEVERITY_LABEL } from '../lib/labels.js';
import { emptyIncidentForm, fieldErrorsFromApi, toIncidentPayload, validateIncidentForm } from '../lib/form.js';

export default function IncidentForm({ api, services, onCreated }) {
  const [values, setValues] = useState(emptyIncidentForm());
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const set = (field) => (e) => setValues({ ...values, [field]: e.target.value });

  function toggleService(id) {
    const has = values.serviceIds.includes(id);
    setValues({
      ...values,
      serviceIds: has ? values.serviceIds.filter((s) => s !== id) : [...values.serviceIds, id],
    });
  }

  async function submit(e) {
    e.preventDefault();
    const found = validateIncidentForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFailure(null);
    try {
      const { incident } = await api.createIncident(toIncidentPayload(values));
      setValues(emptyIncidentForm());
      onCreated(incident);
    } catch (err) {
      if (err.details) setErrors(fieldErrorsFromApi(err.details));
      else setFailure(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Open an incident</h2>
      <label>
        Title
        <input value={values.title} onChange={set('title')} maxLength={140} />
        {errors.title && <span className="error">{errors.title}</span>}
      </label>
      <label>
        What is happening?
        <textarea value={values.summary} onChange={set('summary')} rows={3} />
        {errors.summary && <span className="error">{errors.summary}</span>}
      </label>
      <div className="row">
        <label>
          Severity
          <select value={values.severity} onChange={set('severity')}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Commander
          <input value={values.commander} onChange={set('commander')} placeholder="defaults to whoever is on call" />
          {errors.commander && <span className="error">{errors.commander}</span>}
        </label>
      </div>
      {services.length > 0 && (
        <fieldset>
          <legend>Affected services</legend>
          {services.map((service) => (
            <label key={service.id} className="check">
              <input
                type="checkbox"
                checked={values.serviceIds.includes(service.id)}
                onChange={() => toggleService(service.id)}
              />
              {service.name}
            </label>
          ))}
          {errors.affected && <span className="error">{errors.affected}</span>}
        </fieldset>
      )}
      {failure && <p className="error">{failure}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Opening...' : 'Open incident'}
      </button>
    </form>
  );
}
