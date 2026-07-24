import type { ApiResponse } from '@shared/types';

const BASE_URL = '/api/v1';

/** API 错误 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

function withQuery(path: string, query?: RequestOptions['query']): string {
  if (!query) return path;
  const entries = Object.entries(query).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return path;
  const qs = new URLSearchParams(entries as [string, string][]).toString();
  return `${path}?${qs}`;
}

/** 统一 fetch 封装：自动解包 ApiResponse，失败抛 ApiError
 *
 * credentials: 'include' —— 单账号登录靠 Cookie，必须携带
 * 401 拦截：未登录或会话过期，自动跳转到登录页
 */
import { redirectToLogin } from '@/lib/auth';

let isRedirecting = false;

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, signal } = options;
  const url = `${BASE_URL}${withQuery(path, query)}`;

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  // 401：未登录或会话过期，统一跳登录页（避免并发请求重复跳转）
  if (res.status === 401 && !isRedirecting) {
    isRedirecting = true;
    redirectToLogin();
    throw new ApiError('未登录或会话已过期', 401);
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(`响应解析失败 (${res.status})`, res.status);
  }

  if (!payload.success) {
    throw new ApiError(payload.message || '请求失败', res.status);
  }
  return payload.data;
}
