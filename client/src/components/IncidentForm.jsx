import { useRef, useState } from 'react';
import { SEVERITIES, SEVERITY_LABEL } from '../lib/labels.js';
import { errorId, fieldProps, firstInvalid } from '../lib/a11y.js';
import { emptyIncidentForm, fieldErrorsFromApi, toIncidentPayload, validateIncidentForm } from '../lib/form.js';

export default function IncidentForm({ api, services, onCreated }) {
  const [values, setValues] = useState(emptyIncidentForm());
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const formRef = useRef(null);

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
    if (Object.keys(found).length > 0) {
      // move focus to the first problem so keyboard and screen reader users land on it
      const field = firstInvalid(['title', 'summary', 'commander'], found);
      formRef.current?.elements[field]?.focus();
      return;
    }
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
    <form className="card" ref={formRef} onSubmit={submit} noValidate>
      <h2>Open an incident</h2>
      <label>
        Title
        <input name="title" value={values.title} onChange={set('title')} maxLength={140} {...fieldProps('incident', 'title', errors)} />
        {errors.title && (
          <span className="error" id={errorId('incident', 'title')} role="alert">
            {errors.title}
          </span>
        )}
      </label>
      <label>
        What is happening?
        <textarea name="summary" value={values.summary} onChange={set('summary')} rows={3} {...fieldProps('incident', 'summary', errors)} />
        {errors.summary && (
          <span className="error" id={errorId('incident', 'summary')} role="alert">
            {errors.summary}
          </span>
        )}
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
          <input name="commander" value={values.commander} onChange={set('commander')} placeholder="defaults to whoever is on call" {...fieldProps('incident', 'commander', errors)} />
          {errors.commander && (
            <span className="error" id={errorId('incident', 'commander')} role="alert">
              {errors.commander}
            </span>
          )}
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
      {failure && (
        <p className="error" role="alert">
          {failure}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? 'Opening...' : 'Open incident'}
      </button>
    </form>
  );
}
