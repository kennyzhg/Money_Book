# Money_Book 单账号登录部署指南

本次改造为内网单人独占场景引入了**最小化单账号登录机制**，无 RBAC、无 users 表、无 OAuth——只解决一个问题：防止「顺手打开」式数据窥探。

## 设计要点

| 维度 | 选型 |
|------|------|
| 密码哈希 | bcryptjs cost=12（恒定时间比较，防时间攻击） |
| 会话存储 | SQLite `sessions` 表，存 SHA-256 哈希（非明文 token） |
| 会话有效期 | 默认 7 天，可配 `SESSION_TTL_DAYS` |
| Cookie | `httpOnly + sameSite=strict`，防 XSS/CSRF |
| 启动时清理 | 自动 purge 过期 session |
| 中间件 | `/api/v1/auth/*` 开放；其他 `/api/v1/*` 全部需登录 |

**未引入**：users 表、user_id 列、RBAC、密码找回、OAuth、helmet、rate-limit、IP 黑名单、审计日志、zod（按需扩展时再加）。

## 新增文件清单

后端：
- `api/data/authDb.ts` — sessions 表 + 会话生命周期（createSession/verifySession/destroySession/purgeExpired）
- `api/middleware/auth.ts` — `authenticate` 中间件 + 手写 Cookie 解析（不依赖 cookie-parser）
- `api/routes/auth.ts` — `/login` `/logout` `/check` 路由

前端：
- `src/pages/Login.tsx` — 登录页
- `src/lib/auth.ts` — `useAuthStore` + `redirectToLogin` + `bootstrap` + `login/logout` 动作
- 改 `src/App.tsx` — 加 `RequireAuth` 路由守卫，`/login` 在守卫外
- 改 `src/components/Sidebar.tsx` — 底部加「退出登录」按钮
- 改 `src/api/client.ts` — fetch 加 `credentials: 'include'`、401 拦截跳登录

修复：
- `api/repositories/transactionRepository.ts` — 分页 LIMIT/OFFSET 改为命名参数，消除 SQL 注入隐患

配置：
- `.env.example` — 列出 `APP_PASSWORD_HASH` / `SESSION_TTL_MINUTES` / `AGENT_API_TOKEN` / `COOKIE_SECURE` / `HOST`
- `scripts/gen-password-hash.ts` — 交互式生成 bcrypt 哈希（兼容 TTY/管道/CI）

## 鉴权模型

本系统支持两种鉴权方式，**满足任一即可**：

### 1. Cookie Session（Web UI）

- **滑动过期**，默认 20 分钟（可配 `SESSION_TTL_MINUTES`）
- 每次有 API 请求时自动续期；剩余时间 < TTL/2 才真正写库续期（避免高频写）
- 续期时同步重写浏览器 Cookie，让客户端 expires 跟上后端
- 闲置超过 TTL 才失效；活跃用户不掉线
- 适用：浏览器、移动端 Web UI

### 2. Agent Bearer Token（AI Agent 接入）

- **长期 token**，不走过期机制，配置后立即生效
- 通过 `Authorization: Bearer <token>` 头携带
- 恒定时间比较，防时间攻击
- 适用：OpenClaw / Hermes / Dify / Coze / LangChain / curl 等程序化调用

## 部署步骤

### 1. 生成密码哈希（交互式，仅本地）

```bash
npm run gen-password
# 按提示输入密码两次（输入不回显），输出形如：
# $2a$12$abcdef......
```

### 2. 配置 `.env`（复制 `.env.example` 后填值）

```bash
# 必填：上一步生成的哈希
APP_PASSWORD_HASH=$2a$12$abcdef......

# Cookie 是否仅 HTTPS；内网 HTTP 部署设 false
COOKIE_SECURE=false

# Session 有效期（分钟），滑动过期，默认 20
SESSION_TTL_MINUTES=20

# 可选但强烈推荐：AI Agent 长期 API Token
# 生成方式：openssl rand -hex 32
AGENT_API_TOKEN=

# 端口
PORT=3001

# 绑定网卡；内网单人场景建议设为内网 IP，如 192.168.1.10
# 不配则监听 0.0.0.0（所有网卡，含公网）
HOST=192.168.1.10
```

### 3. 重启服务

```bash
npm run build
npm start
# 或 systemd 重启：systemctl restart money-tracker
```

### 4. 访问

打开浏览器访问 `http://<内网IP>:3001/`，会自动跳到 `/login`，输入密码登录后正常使用。

## API 接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/v1/auth/login` | 否 | body `{ password }`，成功返回 Cookie |
| POST | `/api/v1/auth/logout` | 否 | 清 Cookie + 注销 session |
| GET  | `/api/v1/auth/check` | 否 | 返回 200=已登录，401=未登录 |
| 所有 `/api/v1/*` 业务路由 | 是 | 见下方两种鉴权方式 |

### Agent 接入（推荐方式）

**方式 1：长期 Bearer Token（推荐）**

在 `.env` 配 `AGENT_API_TOKEN=<随机串>` 后，Agent 直接带 Authorization 头调用：

```bash
# 生成 token
TOKEN=$(openssl rand -hex 32)

# Agent 调用示例（curl）
curl -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"date":"2026-07-24","amount":50,"type":"expense","category":"餐饮","paymentMethod":"微信"}' \
     http://money.example.lan:3001/api/v1/transactions
```

OpenClaw/Hermes 等工具的 Authorization 字段直接填这个 token 即可，**无需每次先登录**。

**方式 2：登录拿 Cookie（兼容）**

如果 Agent 不支持自定义 Authorization 头，可以走传统登录流程：

```bash
# 1. 登录拿到 Cookie 写到 /tmp/cookies.txt
curl -c /tmp/cookies.txt -H "Content-Type: application/json" \
     -d '{"password":"你的密码"}' \
     http://money.example.lan:3001/api/v1/auth/login

# 2. 后续请求带 Cookie（20 分钟内有效，过期需重新登录）
curl -b /tmp/cookies.txt http://money.example.lan:3001/api/v1/transactions
```

## 安全说明

- **bcrypt cost=12**：单次哈希约 250ms，足以抵御暴力枚举。
- **token 落库存哈希**：即使数据库泄露，攻击者也无法反推有效 session token。
- **`httpOnly` Cookie**：JavaScript 无法读取，防 XSS 偷 token。
- **`sameSite=strict`**：跨站请求不带 Cookie，防 CSRF。
- **`HOST` 绑定内网 IP**：避免误暴露到公网网卡。

## 未来扩展路径

如需升级到多账号（家庭/小团队场景），代码骨架已就绪：
1. 加 `users` 表（id/username/password_hash/created_at）
2. `authDb.ts` 的 `createSession` 改为带 user_id
3. 业务表加 `user_id` 列 + repository 强制注入（参考 `docs/ACCOUNT_SYSTEM_DESIGN.md` §4）
4. `authenticate` 中间件把 `req.user` 注入到请求上下文

约 2-3 天工作量即可平滑迁移。

## 常见问题

**Q: 忘记密码怎么办？**
A: 单人场景不需要找回机制。重新跑 `npm run gen-password` 生成新哈希，更新 `.env` 后重启服务即可。所有已登录的 session 会因重启而失效（这是预期的，安全优先）。

**Q: 为什么不用 JWT？**
A: 单人内网场景下，session 落库可即时吊销（登出/重启即失效），JWT 反而需要黑名单表才能吊销，复杂度更高。

**Q: 数据库被锁（SQLITE_BUSY）怎么办？**
A: 通常是上次进程异常退出留下的 WAL 锁。删掉 `data/money.db-wal` 和 `data/money.db-shm` 即可，主数据库 `money.db` 不会丢数据。

**Q: Cookie 的 `secure: true` 在 HTTP 下不能用？**
A: 对。`COOKIE_SECURE=false` 时 Cookie 走 HTTP；如果将来上 HTTPS 反代，改成 `true` 即可强制 HTTPS-only Cookie。
