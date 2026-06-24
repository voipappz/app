import { config } from '../config';
import { getToken } from './auth';

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  token?: string | null;
  baseUrl?: string;
}

interface HttpError extends Error {
  status: number;
  data: unknown;
}

async function request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T | null> {
  const base = options.baseUrl ?? config.baseUrl;
  const url = path.startsWith('http') ? path : `${base}${path}`;

  const token = options.token !== undefined ? options.token : getToken();

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.message || `HTTP ${response.status}`) as HttpError;
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  return null;
}

export const httpClient = {
  get: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, options),

  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),

  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),

  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, options),
};
