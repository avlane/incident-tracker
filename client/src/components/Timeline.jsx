import { buildTimeline } from '../lib/timeline.js';
import { STATUS_LABEL } from '../lib/labels.js';

export default function Timeline({ incident }) {
  // Newest first, like a status page.
  const entries = buildTimeline(incident).slice().reverse();
  return (
    <ol className="timeline" aria-label="Incident timeline, newest first">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div className="when">
            <time dateTime={entry.at}>{entry.at.slice(0, 16).replace('T', ' ')} UTC</time>
            <span>{entry.offset}</span>
          </div>
          <div className="what">
            <strong>{entry.kind === 'opened' ? 'Opened' : STATUS_LABEL[entry.status]}</strong>
            {entry.severityChanged && <span className="note"> severity is now {entry.severity.toUpperCase()}</span>}
            {entry.author && <span className="note"> by {entry.author}</span>}
            <p>{entry.message}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
