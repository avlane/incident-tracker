export const initialFilters = { q: '', severity: [], status: [], open: '' };

export function filtersReducer(state, action) {
  switch (action.type) {
    case 'set_q':
      return { ...state, q: action.value };
    case 'toggle': {
      const current = state[action.field];
      const next = current.includes(action.value) ? current.filter((v) => v !== action.value) : [...current, action.value];
      return { ...state, [action.field]: next };
    }
    case 'set_open':
      return { ...state, open: action.value };
    case 'reset':
      return initialFilters;
    default:
      throw new Error(`unknown filter action: ${action.type}`);
  }
}

export function isFiltering(filters) {
  return filters.q.trim() !== '' || filters.severity.length > 0 || filters.status.length > 0 || filters.open !== '';
}
