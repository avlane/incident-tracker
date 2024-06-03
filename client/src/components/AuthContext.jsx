import { createContext, useContext } from 'react';

export const AuthContext = createContext({ user: null });

export function useUser() {
  return useContext(AuthContext).user;
}
