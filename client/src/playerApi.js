import { API_URL } from './adminApi';

export const PLAYER_SERVER_UNAVAILABLE =
  "We couldn't connect. Check your internet connection and try again.";

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
    throw new Error('Something went wrong. Please try again.');
  }
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event('player:unauthorized'));
    throw new Error(
      response.status >= 500
        ? 'Something went wrong. Please try again.'
        : payload.error || 'Something went wrong. Please try again.'
    );
  }
  return payload;
}
