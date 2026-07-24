/**
 * 单账号登录：前端工具
 *
 * - useAuthStore：登录状态 + login()/logout() 动作
 * - redirectToLogin：跳转到 /login（带 redirect 参数）
 * - bootstrapAuth：应用启动时调一次 /auth/check 确认登录态
 */
import { create } from 'zustand';
import { request } from '@/api/client';

/** 跳登录页（带 redirect 回来路径） */
export function redirectToLogin(): void {
  const cur = window.location.pathname + window.location.search;
  if (cur.startsWith('/login')) return;
  window.location.href = `/login?redirect=${encodeURIComponent(cur)}`;
}

interface AuthState {
  /** null=未知（启动检查中），true=已登录，false=未登录 */
  status: 'checking' | 'authenticated' | 'unauthenticated';
  /** 启动时检查登录态 */
  bootstrap: () => Promise<void>;
  /** 登录 */
  login: (password: string) => Promise<void>;
  /** 登出 */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'checking',

  async bootstrap() {
    try {
      await request<{ authenticated: boolean }>('/auth/check');
      set({ status: 'authenticated' });
    } catch {
      set({ status: 'unauthenticated' });
    }
  },

  async login(password: string) {
    // 登录接口走通用 request，但 401 不应触发自动跳转，故单独处理
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.message || '登录失败');
    }
    set({ status: 'authenticated' });
  },

  async logout() {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // 忽略，前端无论如何都跳登录
    }
    set({ status: 'unauthenticated' });
    window.location.href = '/login';
  },
}));
