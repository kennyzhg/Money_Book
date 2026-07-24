/**
 * 单账号登录：sessions 表 + 会话存取
 *
 * 设计要点（单人独占内网场景）：
 * - 不需要 users 表，密码哈希来自环境变量 APP_PASSWORD_HASH
 * - session 落 SQLite，服务重启不丢登录态
 * - session_token 是 32 字节随机串（hex 64 位），存库时存 SHA-256 哈希
 *   即使数据库泄露，攻击者也无法反推有效 token
 * - **滑动过期**：默认 20 分钟，每次 API 请求自动续期；闲置超过 TTL 才失效
 *   可配 SESSION_TTL_MINUTES；活跃用户不掉线
 * - 续期策略：剩余时间不足一半时才续（避免每个请求都写库）
 */
import { db } from './db.js';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

/** Session 有效期（分钟），默认 20 */
const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 20);
const SESSION_TTL_MS = SESSION_TTL_MINUTES * 60 * 1000;
/** 续期阈值：剩余时间 < TTL/2 时续期 */
const RENEW_THRESHOLD_MS = SESSION_TTL_MS / 2;

/** 启动时建表（幂等） */
export function initAuthSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
}

/** 生成随机 token（明文，发给客户端）+ 其哈希（存库） */
function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 创建一个新 session，返回明文 token + 过期时间（ISO） */
export function createSession(): { token: string; expiresAt: string } {
  const { token, hash } = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare(
    `INSERT INTO sessions (token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?)`,
  ).run(hash, now.toISOString(), expiresAt.toISOString(), now.toISOString());
  return { token, expiresAt: expiresAt.toISOString() };
}

/** verifySession 的返回结果 */
export interface VerifyResult {
  valid: boolean;
  /** 续期后的新 expiresAt（仅在 renewed=true 时有意义） */
  renewed?: boolean;
  newExpiresAt?: string;
}

/** 校验 token 是否有效；有效则按需滑动续期
 *
 * 滑动续期规则：剩余时间 < TTL/2 时，把 expires_at 推到 now + TTL，
 * 并返回 renewed=true 让调用方知道要同步刷新 Cookie。
 */
export function verifySession(token: string): VerifyResult {
  if (!token || token.length !== 64) return { valid: false };
  const hash = hashToken(token);
  const now = new Date();
  const nowMs = now.getTime();

  const row = db
    .prepare(`SELECT expires_at FROM sessions WHERE token_hash = ?`)
    .get(hash) as { expires_at: string } | undefined;
  if (!row) return { valid: false };

  const expMs = new Date(row.expires_at).getTime();
  if (expMs <= nowMs) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hash);
    return { valid: false };
  }

  // 滑动续期：剩余时间不足一半时才续
  const remaining = expMs - nowMs;
  if (remaining < RENEW_THRESHOLD_MS) {
    const newExp = new Date(nowMs + SESSION_TTL_MS).toISOString();
    db.prepare(
      `UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?`,
    ).run(newExp, now.toISOString(), hash);
    return { valid: true, renewed: true, newExpiresAt: newExp };
  }

  // 不需要续期，只更新 last_seen_at
  db.prepare(`UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`).run(now.toISOString(), hash);
  return { valid: true, renewed: false };
}

/** 注销指定 token */
export function destroySession(token: string): void {
  if (!token) return;
  const hash = hashToken(token);
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hash);
}

/** 启动时清理所有已过期 session（幂等，不阻塞启动） */
export function purgeExpiredSessions(): void {
  const now = new Date().toISOString();
  const r = db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(now);
  if (r.changes > 0) {
    console.log(`[auth] 清理 ${r.changes} 条过期 session`);
  }
}

/**
 * 校验 Agent 长期 API Token（用于 AI Agent 接入，不走 session 机制）
 *
 * 通过 Authorization: Bearer <token> 头携带，与登录 Cookie 互斥使用。
 * Token 来自环境变量 AGENT_API_TOKEN，不随服务重启失效，需手动轮换。
 *
 * 恒定时间比较，防时间攻击。
 */
export function verifyAgentToken(token: string): boolean {
  const expected = process.env.AGENT_API_TOKEN;
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 当前 Session TTL（毫秒），供其他模块读取 */
export function getSessionTtlMs(): number {
  return SESSION_TTL_MS;
}

initAuthSchema();
