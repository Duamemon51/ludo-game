import { API_URL } from './backendUrl';

export async function signIn(loginId, password) {
  let response;
  try {
    response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password }),
    });
  } catch {
    throw new Error("We couldn't sign you in. Please check your internet connection and try again.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("We couldn't sign you in right now. Please try again.");
  }
  if (!response.ok) {
    throw new Error(
      response.status >= 500
        ? "We couldn't sign you in right now. Please try again."
        : payload.error || "We couldn't sign you in right now. Please try again."
    );
  }
  return payload;
}
