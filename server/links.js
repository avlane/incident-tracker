// Links between incidents. A link is stored on both incidents, each with its
// own wording, so either page can show how it relates to the other:
//
//   A related B       <->  B related A
//   A duplicate_of B  <->  B duplicates A
//   A caused_by B     <->  B caused A

export const LINK_KINDS = ['related', 'duplicate_of', 'duplicates', 'caused_by', 'caused'];

const INVERSE = {
  related: 'related',
  duplicate_of: 'duplicates',
  duplicates: 'duplicate_of',
  caused_by: 'caused',
  caused: 'caused_by',
};

export const inverseKind = (kind) => INVERSE[kind];

const without = (links = [], id) => links.filter((l) => l.id !== id);

// Returns the two updated incidents. Linking the same pair again replaces the
// earlier link rather than adding a second one.
export function linkIncidents(from, to, kind, at) {
  if (from.id === to.id) throw new Error('an incident cannot link to itself');
  if (!INVERSE[kind]) throw new Error(`unknown link kind: ${kind}`);
  return [
    { ...from, links: [...without(from.links, to.id), { id: to.id, kind }], updatedAt: at },
    { ...to, links: [...without(to.links, from.id), { id: from.id, kind: INVERSE[kind] }], updatedAt: at },
  ];
}

export function unlinkIncidents(from, to, at) {
  return [
    { ...from, links: without(from.links, to.id), updatedAt: at },
    { ...to, links: without(to.links, from.id), updatedAt: at },
  ];
}
