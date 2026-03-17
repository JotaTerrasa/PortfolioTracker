import { useCallback } from 'react';
import axios from 'axios';

export function useDashboardAuth({ authStorageKey, setAuthEnabled, setIsAuthenticated }) {
  const getAuthToken = useCallback(() => window.localStorage.getItem(authStorageKey), [authStorageKey]);

  const getApiErrorMessage = useCallback((err, fallback) => {
    const raw = err?.response?.data?.error;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      if (typeof raw.message === 'string') return raw.message;
      return JSON.stringify(raw);
    }
    return fallback;
  }, []);

  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAuthToken]);

  const requestAuthEndpoint = useCallback(async ({ method, path, data, headers }) => {
    try {
      return await axios({ method, url: `/api${path}`, data, headers });
    } catch (err) {
      if (err?.response?.status === 404) {
        return axios({ method, url: path, data, headers });
      }
      throw err;
    }
  }, []);

  const checkAuthStatus = useCallback(async () => {
    try {
      const statusRes = await requestAuthEndpoint({
        method: 'get',
        path: '/auth/status',
        headers: getAuthHeaders(),
      });
      setAuthEnabled(Boolean(statusRes.data?.enabled));
      setIsAuthenticated(Boolean(statusRes.data?.authenticated));
      return statusRes.data;
    } catch {
      setAuthEnabled(false);
      setIsAuthenticated(true);
      return { enabled: false, authenticated: true };
    }
  }, [getAuthHeaders, requestAuthEndpoint, setAuthEnabled, setIsAuthenticated]);

  return {
    getApiErrorMessage,
    getAuthHeaders,
    requestAuthEndpoint,
    checkAuthStatus,
  };
}
