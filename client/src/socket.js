import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;

// Persist the browser ID across tab closes so the server can resume the game.
function getClientId() {
  try {
    let id = localStorage.getItem('ludo-client-id');
    if (!id) {
      id = sessionStorage.getItem('ludo-client-id') ||
        (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) ||
        Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('ludo-client-id', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export const socket = io(URL, {
  auth: { clientId: getClientId() },
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
});