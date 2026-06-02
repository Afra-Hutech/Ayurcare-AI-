import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://127.0.0.1:5001';

export const createDoctorPortalChatSocket = (token) => io(SOCKET_URL, {
  auth: { token },
  transports: ['polling'],
  upgrade: false,
});
