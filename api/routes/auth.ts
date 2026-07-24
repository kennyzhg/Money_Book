/**
 * 认证路由（单账号场景）
 *
 * POST /api/v1/auth/login   { password } → set-cookie + 200
 * POST /api/v1/auth/logout  → clear-cookie + 200
 * GET  /api/v1/auth/check   → 200 if logged in, 401 otherwise
 *
 * 密码哈希来自环境变量 APP_PASSWORD_HASH（bcrypt），不存在则禁止登录并打印告警
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { sendOk, sendFail } from '../utils/response.js';
import { createSession, destroySession, verifySession, purgeExpiredSessions } from '../data/authDb.js';
import { authenticate, SESSION_COOKIE_NAME } from '../middleware/auth.js';

const router = Router();

/** 读取密码哈希；未配置时给出明确提示 */
function getPasswordHash(): string | null {
  const h = process.env.APP_PASSWORD_HASH;
  if (!h) {
    console.error('[auth] 未配置 APP_PASSWORD_HASH，无法登录。请用 `npm run gen-password` 生成。');
    return null;
  }
  return h;
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

/** 登录：校验密码，成功后下发 session Cookie */
router.post('/login', (req, res) => {
  const hash = getPasswordHash();
  if (!hash) {
    return sendFail(res, '服务器未配置登录密码，请联系管理员', 503);
  }
  const { password } = req.body as { password?: string };
  if (!password || typeof password !== 'string') {
    return sendFail(res, '请输入密码', 400);
  }

  // bcrypt.compareSync 是恒定时间比较，防时间攻击
  const ok = bcrypt.compareSync(password, hash);
  if (!ok) {
    return sendFail(res, '密码错误', 401);
  }

  // 启动后首次成功登录时清一波过期 session
  purgeExpiredSessions();

  const { token, expiresAt } = createSession();
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(new Date(expiresAt)));
  return sendOk(res, { ok: true }, '登录成功');
});

/** 登出：清 Cookie + 注销 session */
router.post('/logout', (req, res) => {
  const raw = req.headers.cookie || '';
  const token = (raw.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`)) || [])[1];
  if (token) {
    destroySession(decodeURIComponent(token));
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  return sendOk(res, { ok: true }, '已登出');
});

/** 检查登录状态：前端启动时调，决定是否跳登录页 */
router.get('/check', authenticate, (_req, res) => {
  sendOk(res, { authenticated: true }, '已登录');
});

export default router;
