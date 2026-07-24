/**
 * 鉴权中间件（单账号场景）
 *
 * 鉴权方式（两种，满足任一即可）：
 *   1. Cookie session（Web UI 用）—— 滑动过期，默认 20 分钟闲置失效
 *   2. Authorization: Bearer <AGENT_API_TOKEN>（AI Agent 用）—— 长期 token，不走过期
 *
 * Cookie 滑动刷新：当后端 session 被续期时，中间件会同步重写客户端 Cookie，
 * 让浏览器 Cookie 的 expires 跟上后端的 expires_at，做到全链路滑动过期。
 * - 健康检查、登录接口本身不走此中间件
 * - 单账号场景无角色概念，故无 requireRole
 */
import type { Request, Response, NextFunction } from 'express';
import { verifySession, verifyAgentToken } from '../data/authDb.js';

export const SESSION_COOKIE_NAME = 'mb_session';

/** 从 Cookie header 解析出指定 key 的值 */
export function getCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const pair of raw.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return undefined;
}

/** 从 Authorization 头解析 Bearer token */
function getBearerToken(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (!h || typeof h !== 'string') return undefined;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : undefined;
}

/** Cookie 选项：httpOnly + sameSite=strict，secure 由环境决定 */
function cookieOptions(expiresAt: Date) {
  const secure = process.env.COOKIE_SECURE === 'true';
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure,
    path: '/',
    expires: expiresAt,
  };
}

/** 鉴权：Agent Bearer Token 或 Cookie session，任一通过即可 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // 1. AI Agent 走 Bearer Token（长期，无过期）
  const bearer = getBearerToken(req);
  if (bearer && verifyAgentToken(bearer)) {
    next();
    return;
  }

  // 2. Web UI 走 Cookie session（滑动过期）
  const sessionToken = getCookie(req, SESSION_COOKIE_NAME);
  if (sessionToken) {
    const result = verifySession(sessionToken);
    if (result.valid) {
      // 滑动续期：同步刷新浏览器 Cookie，让客户端 expires 跟上后端
      if (result.renewed && result.newExpiresAt) {
        res.cookie(
          SESSION_COOKIE_NAME,
          sessionToken,
          cookieOptions(new Date(result.newExpiresAt)),
        );
      }
      next();
      return;
    }
  }

  res.status(401).json({ success: false, data: null, message: '未登录或会话已过期' });
}
