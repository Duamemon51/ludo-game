import { API_URL } from './adminApi';

export async function signIn(loginId, password) {
  let response;
  try {
    response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password }),
    });
  } catch {
    throw new Error('Cannot reach the Node.js server. Check that the server is running.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Server returned an invalid response (${response.status}).`);
  }
  if (!response.ok) throw new Error(payload.error || `Sign in failed (${response.status}).`);
  return payload;
}
