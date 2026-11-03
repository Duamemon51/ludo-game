import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;

// A private ID for this browser tab. It survives refreshes, so the server can
// recognize you and put you back in your game.
function getClientId() {
  try {
    let id = sessionStorage.getItem('ludo-client-id');
    if (!id) {
      id =
        (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
        Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('ludo-client-id', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export const socket = io(URL, { auth: { clientId: getClientId() } });