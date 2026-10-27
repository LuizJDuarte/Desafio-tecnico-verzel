import { createContext, useContext } from 'react';
import type { UserDto, UserRole } from '@arremate/shared';

export interface AuthContextValue {
  user: UserDto | null;
  loading: boolean;
  login(email: string, password: string): Promise<UserDto>;
  register(input: { name: string; email: string; password: string; role: UserRole }): Promise<UserDto>;
  logout(): Promise<void>;
}

// Fica fora de AuthContext.tsx para o Fast Refresh do Vite: módulos de componente só exportam componentes.
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return context;
}
