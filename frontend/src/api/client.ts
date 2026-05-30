import axios from 'axios';

// Get API base URL from Vite environment or default to current host
const API_URL = import.meta.env.VITE_API_URL || '';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Auth event dispatchers ──────────────────────────────────
// Used by UI components to show loading/error states during token refresh

function dispatchAuthEvent(type: string, detail?: string) {
  window.dispatchEvent(
    new CustomEvent(type, { detail: detail || '' })
  );
}

// ── Request Interceptor: Attach access token if present ─────
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    // Only set Authorization from localStorage if not already explicitly provided
    // (e.g., login verification explicitly sets a fresh token before storing it)
    if (token && config.headers && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ── Response Interceptor: Handle token refresh on 401 ───────
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Check if error is 401 (Unauthorized) and we haven't already retried this request
    if (error.response?.status === 401 && !originalRequest._retry) {
      // If we're hitting /auth/login or /auth/register, don't try to refresh
      if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/register')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Mark as a retry so this request doesn't re-enter the refresh loop
        originalRequest._retry = true;
        return new Promise<string | null>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        isRefreshing = false;
        handleLogout();
        return Promise.reject(error);
      }

      // Dispatch event: token refresh is in progress
      dispatchAuthEvent('auth-refreshing');

      try {
        const response = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken });
        const { access_token, refresh_token } = response.data;

        localStorage.setItem('accessToken', access_token);
        localStorage.setItem('refreshToken', refresh_token);

        apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        originalRequest.headers['Authorization'] = `Bearer ${access_token}`;

        processQueue(null, access_token);
        isRefreshing = false;

        // Dispatch event: refresh succeeded
        dispatchAuthEvent('auth-refreshed');

        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        isRefreshing = false;

        // Dispatch event: refresh failed (before logout so UI can show a brief message)
        dispatchAuthEvent('auth-refresh-failed', 'Session expired. Please sign in again.');

        handleLogout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

function handleLogout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  // Dispatch a custom event to alert Zustand and components to reset state
  window.dispatchEvent(new Event('auth-logout'));
}
