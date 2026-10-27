import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Conexão única com o servidor de tempo real (mesma origem; a sessão vai pelo cookie). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

/** Após login/logout o cookie muda: reconecta para o servidor reconhecer o novo usuário. */
export function reconnectSocket(): void {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}
