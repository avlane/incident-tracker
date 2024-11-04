const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Mon 09:00" in UTC, so everyone reads the same handover time.
export function shortUtc(iso) {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]} ${hh}:${mm}`;
}

export function describeCurrent(schedule) {
  const { current } = schedule;
  if (!current) return { who: null, text: 'Not started yet' };
  const via = current.source === 'override' ? ' (override)' : '';
  return { who: current.who, text: `${current.who}${via} until ${shortUtc(current.to)} UTC` };
}

// The next handovers after the current shift, ignoring the shift we are in.
export function nextHandovers(schedule, count = 3) {
  const currentEnd = schedule.current?.to;
  return schedule.upcoming
    .filter((shift) => !currentEnd || shift.from >= currentEnd)
    .slice(0, count)
    .map((shift) => ({ who: shift.who, from: shortUtc(shift.from) }));
}
