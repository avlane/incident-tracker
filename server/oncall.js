// On-call rotations. A schedule rotates through `members` every
// `rotationHours`, starting at `startsAt`. Overrides cover holidays and swaps
// and always win over the rotation.

const HOUR = 3_600_000;

// The nth shift of the rotation (n = 0 is the first one, starting at startsAt).
function shiftNumber(schedule, n) {
  const start = Date.parse(schedule.startsAt);
  const length = schedule.rotationHours * HOUR;
  const size = schedule.members.length;
  return {
    index: n,
    who: schedule.members[((n % size) + size) % size],
    start: start + n * length,
    end: start + (n + 1) * length,
  };
}

function shiftAt(schedule, atMs) {
  const length = schedule.rotationHours * HOUR;
  return shiftNumber(schedule, Math.floor((atMs - Date.parse(schedule.startsAt)) / length));
}

// Who is on call at `at` (an ISO string). Returns null before the schedule
// has started.
export function whoIsOnCall(schedule, at) {
  const atMs = Date.parse(at);
  if (atMs < Date.parse(schedule.startsAt)) return null;
  for (let i = schedule.overrides.length - 1; i >= 0; i--) {
    const o = schedule.overrides[i];
    if (atMs >= Date.parse(o.from) && atMs < Date.parse(o.to)) {
      return { who: o.who, source: 'override', from: o.from, to: o.to };
    }
  }
  const shift = shiftAt(schedule, atMs);
  return {
    who: shift.who,
    source: 'rotation',
    from: new Date(shift.start).toISOString(),
    to: new Date(shift.end).toISOString(),
  };
}

// The next `count` rotation shifts from `at`, ignoring overrides.
export function upcomingShifts(schedule, at, count = 4) {
  const first = shiftAt(schedule, Math.max(Date.parse(at), Date.parse(schedule.startsAt)));
  return Array.from({ length: count }, (_, k) => {
    const shift = shiftNumber(schedule, first.index + k);
    return {
      who: shift.who,
      from: new Date(shift.start).toISOString(),
      to: new Date(shift.end).toISOString(),
    };
  });
}

export function createSchedule(input, { id, now }) {
  return {
    id,
    name: input.name,
    members: input.members,
    startsAt: input.startsAt,
    rotationHours: input.rotationHours ?? 168,
    overrides: [],
    createdAt: now,
  };
}

export function addOverride(schedule, override) {
  return { ...schedule, overrides: [...schedule.overrides, override] };
}
