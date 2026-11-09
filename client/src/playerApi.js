import { API_URL } from './adminApi';

export const PLAYER_SERVER_UNAVAILABLE =
  'Unable to reach the game server. Check your connection and try again.';

export async function playerRequest(path, { token, method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_URL}/api/player${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(PLAYER_SERVER_UNAVAILABLE);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Server returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event('player:unauthorized'));
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}
