import { useState } from 'react';
import { SEVERITIES, SEVERITY_LABEL, STATUS_LABEL } from '../lib/labels.js';
import { allowedStatuses, emptyUpdateForm, toUpdatePayload } from '../lib/timeline.js';
import { fieldErrorsFromApi } from '../lib/form.js';
import { errorId, fieldProps } from '../lib/a11y.js';

export default function UpdateForm({ api, incident, onUpdated }) {
  const [values, setValues] = useState(emptyUpdateForm(incident));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const set = (field) => (e) => setValues({ ...values, [field]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (values.message.trim() === '') {
      setErrors({ message: 'Say what changed.' });
      return;
    }
    setBusy(true);
    setErrors({});
    setFailure(null);
    try {
      const { incident: next } = await api.postUpdate(incident.id, toUpdatePayload(values, incident));
      setValues(emptyUpdateForm(next));
      onUpdated(next);
    } catch (err) {
      if (err.details) setErrors(fieldErrorsFromApi(err.details));
      else setFailure(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Post an update</h2>
      <label>
        Message
        <textarea value={values.message} onChange={set('message')} rows={3} {...fieldProps('update', 'message', errors)} />
        {errors.message && (
          <span className="error" id={errorId('update', 'message')} role="alert">
            {errors.message}
          </span>
        )}
      </label>
      <div className="row">
        <label>
          Status
          <select value={values.status} onChange={set('status')}>
            {allowedStatuses(incident.status).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
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
          Your name
          <input value={values.author} onChange={set('author')} />
        </label>
      </div>
      {failure && (
        <p className="error" role="alert">
          {failure}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? 'Posting...' : 'Post update'}
      </button>
    </form>
  );
}
