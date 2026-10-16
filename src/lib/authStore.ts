import { UserAccount } from '@/types/fantasy';
import { ensureClientStorageReset } from './leagueStore';

const AUTH_USER_KEY = 'tradehorny_auth_user';
const AUTH_TOKEN_KEY = 'tradehorny_auth_token';
export const AUTH_CHANGE_EVENT = 'tradehorny:auth-change';

export function getStoredUser(): UserAccount | null {
  if (typeof window === 'undefined') return null;
  ensureClientStorageReset();
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as UserAccount) : null;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  ensureClientStorageReset();
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveAuthSession(user: UserAccount, token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: user }));
  } catch {
    // Ignore storage errors
  }
}

export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: null }));
  } catch {
    // Ignore storage errors
  }
}

export async function registerAccount(
  username: string,
  password: string
): Promise<UserAccount> {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      username,
      password,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create account.');
  }

  saveAuthSession(data.user, data.token);
  return data.user;
}

export async function loginAccount(
  username: string,
  password: string
): Promise<UserAccount> {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'login',
      username,
      password,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to log in.');
  }

  saveAuthSession(data.user, data.token);
  return data.user;
}

export async function logoutAccount(): Promise<void> {
  const token = getStoredToken();
  if (token) {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'logout',
          token,
        }),
      });
    } catch {
      // Best-effort
    }
  }
  clearAuthSession();
}

/**
 * Fetches the freshest user account state from the server (e.g. latest claimedTeams across devices).
 */
export async function fetchCurrentUser(): Promise<UserAccount | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch(`/api/auth?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      // Token might be invalid/expired
      clearAuthSession();
      return null;
    }
    const data = await res.json();
    if (data && data.success && data.user) {
      // Update local storage with fresh user details
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
      window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: data.user }));
      return data.user;
    }
  } catch {
    // Network fallback to locally cached user
  }

  return getStoredUser();
}

/**
 * Associates a claimed team with the logged-in user account on the server and local storage.
 */
export async function linkTeamToAccount(
  leagueId: string,
  teamId: string,
  userId?: string
): Promise<UserAccount | null> {
  const currentUser = getStoredUser();
  const targetUserId = userId || currentUser?.id;
  if (!targetUserId) return null;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'link_claim',
        userId: targetUserId,
        leagueId: String(leagueId).trim(),
        teamId: String(teamId).trim(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.user) {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: data.user }));
        return data.user;
      }
    }
  } catch {
    // Fallback: update local storage copy
  }

  if (currentUser) {
    const updated: UserAccount = {
      ...currentUser,
      claimedTeams: {
        ...(currentUser.claimedTeams || {}),
        [String(leagueId).trim()]: String(teamId).trim(),
      },
    };
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: updated }));
    return updated;
  }

  return null;
}
