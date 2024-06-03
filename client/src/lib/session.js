// Sign-in state as a reducer, so the transitions can be tested without React.
//
//   loading -> signed_in | anonymous
//   signed_in -> anonymous (signed out, or the server said the session expired)

export const initialSession = { status: 'loading', user: null, notice: null };

export function sessionReducer(state, action) {
  switch (action.type) {
    case 'loaded':
      return action.user
        ? { status: 'signed_in', user: action.user, notice: null }
        : { status: 'anonymous', user: null, notice: null };
    case 'signed_in':
      return { status: 'signed_in', user: action.user, notice: null };
    case 'signed_out':
      return { status: 'anonymous', user: null, notice: null };
    case 'expired':
      return state.status === 'signed_in'
        ? { status: 'anonymous', user: null, notice: 'Your session expired. Please sign in again.' }
        : state;
    default:
      throw new Error(`unknown session action: ${action.type}`);
  }
}

const ORDER = ['viewer', 'responder', 'admin'];
export const hasRole = (user, needed) => Boolean(user) && ORDER.indexOf(user.role) >= ORDER.indexOf(needed);
export const canRespond = (user) => hasRole(user, 'responder');
