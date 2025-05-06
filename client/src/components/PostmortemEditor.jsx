import { useState } from 'react';
import { blankActionItem, emptyPostmortemForm, toPostmortemPayload, validatePostmortemForm } from '../lib/postmortem.js';

export default function PostmortemEditor({ api, incident, onSaved }) {
  const [form, setForm] = useState(emptyPostmortemForm(incident));
  const [errors, setErrors] = useState({});
  const [state, setState] = useState('idle'); // idle | saving | saved | failed
  const [failure, setFailure] = useState(null);

  const set = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    setState('idle');
  };

  function setItem(i, field, value) {
    setForm({ ...form, actionItems: form.actionItems.map((item, n) => (n === i ? { ...item, [field]: value } : item)) });
    setState('idle');
  }

  async function save(e) {
    e.preventDefault();
    const found = validatePostmortemForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setState('saving');
    setFailure(null);
    try {
      const { postmortem } = await api.putPostmortem(incident.id, toPostmortemPayload(form));
      onSaved(postmortem);
      setState('saved');
    } catch (err) {
      setFailure(err.message);
      setState('failed');
    }
  }

  return (
    <form className="card" onSubmit={save} noValidate>
      <h2>Postmortem</h2>
      <label>
        Root cause
        <textarea value={form.rootCause} onChange={set('rootCause')} rows={4} />
        {errors.rootCause && <span className="error">{errors.rootCause}</span>}
      </label>
      <label>
        How was it detected?
        <textarea value={form.detection} onChange={set('detection')} rows={2} />
      </label>
      <div className="row">
        <label>
          What went well (one per line)
          <textarea value={form.wentWell} onChange={set('wentWell')} rows={4} />
        </label>
        <label>
          What went poorly (one per line)
          <textarea value={form.wentPoorly} onChange={set('wentPoorly')} rows={4} />
        </label>
      </div>
      <fieldset>
        <legend>Action items</legend>
        {form.actionItems.map((item, i) => (
          <div className="row" key={i}>
            <label>
              Action
              <input value={item.action} onChange={(e) => setItem(i, 'action', e.target.value)} />
            </label>
            <label>
              Owner
              <input value={item.owner} onChange={(e) => setItem(i, 'owner', e.target.value)} />
            </label>
            <label>
              Due
              <input type="date" value={item.due} onChange={(e) => setItem(i, 'due', e.target.value)} />
            </label>
            {errors[`actionItems.${i}`] && <span className="error">{errors[`actionItems.${i}`]}</span>}
          </div>
        ))}
        <button type="button" className="link" onClick={() => setForm({ ...form, actionItems: [...form.actionItems, blankActionItem()] })}>
          Add an action item
        </button>
      </fieldset>
      {failure && <p className="error">{failure}</p>}
      <button type="submit" disabled={state === 'saving'}>
        {state === 'saving' ? 'Saving...' : 'Save postmortem'}
      </button>
      {state === 'saved' && <span className="note"> Saved.</span>}
    </form>
  );
}
