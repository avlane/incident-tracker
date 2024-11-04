import { useEffect, useState } from 'react';
import { describeCurrent, nextHandovers } from '../lib/oncall.js';

export default function OnCallPanel({ api }) {
  const [schedules, setSchedules] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.listOnCall().then(
      (r) => !cancelled && setSchedules(r.schedules),
      () => !cancelled && setSchedules([]),
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (!schedules || schedules.length === 0) return null;
  return (
    <section className="card oncall">
      <h2>On call</h2>
      {schedules.map((schedule) => {
        const current = describeCurrent(schedule);
        const next = nextHandovers(schedule);
        return (
          <div key={schedule.id} className="schedule">
            <strong>{schedule.name}</strong>
            <div>{current.text}</div>
            {next.length > 0 && (
              <div className="note">
                Next: {next.map((n) => `${n.who} from ${n.from}`).join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
