import { getApiUrl } from './runtimeConfig';
import { getCurrentSession } from './firebaseClient';

type JsonLike = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type BackendResponse<T = any> = {
  response: Response;
  data: T | null;
};

const withJsonContentType = (headers?: HeadersInit) => {
  const next = new Headers(headers || {});
  if (!next.has('Content-Type')) {
    next.set('Content-Type', 'application/json');
  }
  return next;
};

export const requestBackend = async <T = any>(
  path: string,
  init: RequestInit & {
    bodyJson?: JsonLike;
    requireAuth?: boolean;
    forceRefreshToken?: boolean;
  } = {},
): Promise<BackendResponse<T>> => {
  const {
    bodyJson,
    headers,
    requireAuth = true,
    forceRefreshToken = false,
    ...requestInit
  } = init;

  const session = await getCurrentSession(forceRefreshToken);
  if (requireAuth && !session) {
    throw new Error('LOGIN_REQUIRED');
  }

  const finalHeaders = bodyJson !== undefined
    ? withJsonContentType(headers)
    : new Headers(headers || {});

  if (session?.access_token) {
    finalHeaders.set('Authorization', `Bearer ${session.access_token}`);
  }

  const response = await fetch(getApiUrl(path), {
    ...requestInit,
    headers: finalHeaders,
    body: bodyJson !== undefined ? JSON.stringify(bodyJson) : requestInit.body,
  });

  const data = await response.json().catch(() => null);
  return { response, data };
};

export const parseBackendError = (status: number, data: any, fallback: string) => {
  if (status === 401 || data?.code === 'LOGIN_REQUIRED') {
    return 'LOGIN_REQUIRED';
  }

  return data?.code || data?.error || fallback;
};
