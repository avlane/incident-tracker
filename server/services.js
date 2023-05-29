// Services and their components. A service is something customers or other
// teams depend on (Checkout, Search); components are the parts of it that can
// fail separately (API, Database, Worker queue).

export function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function uniqueId(base, taken) {
  const root = base || 'item';
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}

// Existing component ids are kept when a component with the same name is
// submitted again, so editing a service doesn't orphan old references.
function buildComponents(names, existing = []) {
  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));
  const taken = new Set();
  const out = [];
  for (const name of names) {
    const known = byName.get(name.toLowerCase());
    if (known && !taken.has(known.id)) {
      taken.add(known.id);
      out.push(known);
      continue;
    }
    const id = uniqueId(slugify(name), taken);
    taken.add(id);
    out.push({ id, name });
  }
  return out;
}

export function createService(input, { takenIds, now }) {
  const id = uniqueId(slugify(input.name), takenIds);
  return {
    id,
    name: input.name,
    description: input.description ?? '',
    components: buildComponents(input.components ?? []),
    createdAt: now,
    updatedAt: now,
  };
}

export function updateService(service, input, { now }) {
  return {
    ...service,
    name: input.name ?? service.name,
    description: input.description ?? service.description,
    components: input.components ? buildComponents(input.components, service.components) : service.components,
    updatedAt: now,
  };
}
