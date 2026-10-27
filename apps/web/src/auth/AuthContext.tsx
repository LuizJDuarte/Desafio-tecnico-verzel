import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { UserDto, UserRole } from '@arremate/shared';
import { api, ApiError } from '../lib/api';
import { queryKeys } from '../lib/queries';
import { reconnectSocket } from '../lib/socket';
import { AuthContext, type AuthContextValue } from './auth-context';

/** Canal entre abas do mesmo navegador: todas compartilham o mesmo cookie de sessão. */
const SESSION_CHANNEL = 'arremate:sessao';

async function fetchCurrentUser(): Promise<UserDto | null> {
  try {
    return (await api<{ user: UserDto | null }>('/auth/me')).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const channel = useRef<BroadcastChannel | null>(null);
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const resetSessionData = useCallback(
    (user: UserDto | null) => {
      // Dados de outra sessão (carteira, painel, posição nos lotes) não podem vazar para a nova.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
      queryClient.setQueryData(queryKeys.me, user);
      reconnectSocket();
    },
    [queryClient],
  );

  // Login ou logout em outra aba troca o cookie desta também: a tela acompanha na hora, em vez de
  // continuar mostrando um usuário enquanto as ações já saem como outro.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const current = new BroadcastChannel(SESSION_CHANNEL);
    channel.current = current;
    current.onmessage = () => {
      void fetchCurrentUser()
        .then((user) => {
          resetSessionData(user);
          toast.info(
            user
              ? `A sessão mudou em outra aba: agora você está como ${user.name}.`
              : 'Você saiu da conta em outra aba.',
          );
        })
        .catch(() => undefined);
    };
    return () => {
      current.close();
      channel.current = null;
    };
  }, [resetSessionData]);

  const afterSessionChange = useCallback(
    (user: UserDto | null) => {
      resetSessionData(user);
      channel.current?.postMessage('session-changed');
    },
    [resetSessionData],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await api<{ user: UserDto }>('/auth/login', { method: 'POST', json: { email, password } });
      afterSessionChange(user);
      return user;
    },
    [afterSessionChange],
  );

  const register = useCallback(
    async (input: { name: string; email: string; password: string; role: UserRole }) => {
      const { user } = await api<{ user: UserDto }>('/auth/register', { method: 'POST', json: input });
      afterSessionChange(user);
      return user;
    },
    [afterSessionChange],
  );

  const logout = useCallback(async () => {
    await api<void>('/auth/logout', { method: 'POST' });
    afterSessionChange(null);
  }, [afterSessionChange]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: me.data ?? null, loading: me.isPending, login, register, logout }),
    [me.data, me.isPending, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
