import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { AuthSession } from '../types';

const STORAGE_KEY = 'hr_app_session';

export function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
});

apiClient.interceptors.request.use((config) => {
  const session = loadSession();
  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const session = loadSession();
  if (!session?.refreshToken) return null;

  try {
    const { data } = await axios.post(`${apiClient.defaults.baseURL}/auth/refresh`, {
      refreshToken: session.refreshToken,
    });
    const updated: AuthSession = {
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
      user: data.data.user,
      projects: data.data.projects,
      permissions: data.data.permissions,
    };
    saveSession(updated);
    return updated.accessToken;
  } catch {
    clearSession();
    return null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    const original = error.config;
    const status = error.response?.status;

    // A 401 means the access token expired — try one silent refresh before
    // giving up. A 403 is a genuine authorization denial (wrong role,
    // wrong project, missing permission) — never retried, always surfaced.
    if (status === 401 && original && !(original as any)._retried) {
      (original as any)._retried = true;
      if (!refreshPromise) refreshPromise = refreshAccessToken();
      const newToken = await refreshPromise;
      refreshPromise = null;

      if (newToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      }

      clearSession();
      window.location.assign('/login');
      return Promise.reject(error);
    }

    if (status === 403) {
      toast.error(error.response?.data?.message ?? 'Access Denied');
    }

    return Promise.reject(error);
  }
);

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as any)?.message ?? fallback;
  }
  return fallback;
}
