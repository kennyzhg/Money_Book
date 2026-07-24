# Money_Book 账号系统与安全设计

> 本文档基于对现有代码的完整调研（`api/app.ts` / `api/data/db.ts` / 各 repository / `package.json`）后产出。
> 结论：**当前项目无任何认证/隔离/防护**，所有数据共享 `data/money.db`，`cors()` 完全裸开放，外网直连即等于数据库裸奔。
> 本设计同时覆盖：账号、权限、隔离、反代/SSL、外网安全、完备性评估与补充要点。

---

## 一、现状评估（基线）

| 维度 | 现状 | 风险 |
|------|------|------|
| 认证 | 无 users 表，无 JWT | 任何人都能调 `/api/v1/*` |
| 数据隔离 | 单文件单 schema，无 user_id | 多人共用必然混淆 |
| CORS | `app.use(cors())` 全开放 | 任意站点可调你的 API |
| 速率限制 | 无 | 暴力枚举/扫接口无阻拦 |
| 输入校验 | controller 内零散校验 | SQL 注入/XSS 风险点散布 |
| 安全响应头 | 无 helmet | 点击劫持/MIME 嗅探 |
| 反代 | systemd 直暴端口 | 无 TLS、无 IP 黑名单能力 |

---

## 二、认证体系设计

### 2.1 技术选型

- **密码哈希**：`bcrypt`（cost = 12）。理由：Node 原生支持、抗暴力（可调 cost）、抗彩虹表。
- **令牌**：JWT（Access Token）+ 不透明 Refresh Token（落库哈希）。
  - 库：`jsonwebtoken`（签发/校验）+ 自建 refresh 表。
  - 不用 `passport-jwt`：本项目体量小，手写中间件更可控。
- **OAuth（可选扩展）**：保留接入位，但默认不实现。原因见 §2.5。

### 2.2 双 Token 机制

| Token 类型 | 载体 | 有效期 | 存储 | 吊销方式 |
|-----------|------|--------|------|---------|
| Access Token | `Authorization: Bearer <jwt>` | 15 分钟 | 客户端内存 + sessionStorage | 短有效期 + 黑名单表 |
| Refresh Token | httpOnly Cookie | 30 天 | 数据库 `refresh_tokens` 表（存 SHA-256 哈希） | 标记 `revoked = 1` |

**为什么 Refresh 落库？** JWT 一旦签发无法撤销，Access 短命降低风险；Refresh 落库才能在登出/改密/被盗时即时吊销。

### 2.3 JWT Payload 结构

```json
{
  "sub": "user-uuid",
  "role": "user",          // user | admin
  "scopes": ["tx:read", "tx:write", "config:write"],
  "iat": 1730000000,
  "exp": 1730000900,       // +15min
  "jti": "random-uuid"     // 用于黑名单
}
```

- **绝不**把敏感信息（密码哈希、邮箱）塞进 JWT。
- JWT 密钥从环境变量 `JWT_SECRET` 注入，至少 32 字节随机串，禁止硬编码。

### 2.4 关键路由

```
POST   /api/v1/auth/register     注册（开放，但限速）
POST   /api/v1/auth/login        登录 → 签发双 Token
POST   /api/v1/auth/refresh      用 Refresh Token 换新 Access Token
POST   /api/v1/auth/logout       吊销当前 Refresh Token
POST   /api/v1/auth/forgot       发起密码找回（发邮件/打印令牌）
POST   /api/v1/auth/reset        用一次性令牌重置密码
GET    /api/v1/auth/me           获取当前用户信息
```

### 2.5 密码找回机制

**方案选择（按优先级）：**

1. **首选**：邮箱 + 一次性 Token。`password_resets` 表存 `(user_id, token_hash, expires_at, used)`，token 30 分钟过期、一次性使用。
2. **次选**（无邮箱服务时）：管理员重置。`admin` 角色直接重置某用户密码，新密码通过安全渠道（线下）告知。
3. **兜底**：CLI 脚本 `npm run reset-password -- --user <uid>`，仅服务器本地可执行。

**禁止**：安全问题找回（答案易被社工）、把旧密码发回邮箱。

### 2.6 OAuth（可选扩展，默认不实现）

**为什么默认不做**：
- 个人/小团队记账应用通常不需要第三方登录。
- OAuth 涉及 client_id/secret 管理、redirect_uri 白名单、state 防 CSRF、provider 适配层，复杂度上升一个量级。

**若日后要做**：
- 接入位：`/api/v1/auth/oauth/:provider/callback`。
- 推荐 `arctic` 库（轻量 OAuth 2.0 客户端，无 passport 全家桶包袱）。
- 仍要把 provider 返回的用户绑定到本地 `users` 表，OAuth 仅作登录凭证、不作数据隔离边界。

---

## 三、权限与角色管理（RBAC）

### 3.1 角色定义

| 角色 | 权限范围 |
|------|---------|
| `user` | 仅自己 `user_id` 名下的所有业务数据增删改查 |
| `admin` | 上述权限 + 用户管理（列表/禁用/重置密码） + 审计日志查看 + 全局统计 |

**设计原则**：admin **不能**读取普通用户的交易明细，只能看元信息和聚合统计。这是隐私底线。

### 3.2 中间件实现

```typescript
// api/middleware/auth.ts
export function authenticate(req, res, next) {
  const token = extractBearer(req);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!);  // { id, role, scopes }
    next();
  } catch {
    res.status(401).json({ success: false, message: '未登录或令牌已过期' });
  }
}

export function requireRole(...roles: string[]) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    next();
  };
}

export function requireScope(scope: string) {
  return (req, res, next) => {
    if (!req.user.scopes?.includes(scope)) {
      return res.status(403).json({ success: false, message: '缺少权限: ' + scope });
    }
    next();
  };
}
```

### 3.3 路由保护策略

```typescript
// 所有 /api/v1/* 业务路由统一在最外层加 authenticate
router.use(authenticate);

// 用户管理路由额外加 admin 校验
app.use('/api/v1/admin/users', authenticate, requireRole('admin'), userAdminRoutes);
```

---

## 四、多账号数据隔离

### 4.1 方案对比与选型

| 维度 | 方案 A · 逻辑隔离（行级 user_id） | 方案 B · 物理隔离（每用户独立 db） |
|------|----------------------------------|----------------------------------|
| 改动量 | 小：加列 + 仓库层注入 user_id | 大：连接池按 uid 取实例、跨用户查询需聚合 |
| 隔离强度 | 中：依赖代码正确性，bug 即泄露 | 强：物理断绝，bug 难以越权 |
| 备份/迁移 | 简单：单文件 | 复杂：每用户一个文件 |
| 资源开销 | 低：一个连接 | 高：N 个用户 = N 个文件句柄 |
| 删用户 | DELETE + 行清理 | rm 文件即可 |
| 适用场景 | 个人/家庭/小团队（<100 用户） | SaaS / 强合规 / 大规模多租户 |

**Money_Book 选型结论：方案 A（逻辑隔离）。**

理由：
1. 项目定位是个人/小团队记账，用户量预期 < 100。
2. SQLite 单文件已是既定架构，物理隔离会让文件句柄和备份复杂度爆炸。
3. 通过「仓库层强制 user_id 注入 + 单元测试覆盖」可把泄露风险降到可接受。
4. 若未来转 SaaS，再做一次迁移到 PostgreSQL + RLS（行级安全）即可。

### 4.2 落地实施步骤

#### 4.2.1 Schema 改造

所有业务表统一加 `user_id` 列：

```sql
-- 1. 新增 users 表
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 2. 业务表加 user_id（用 migration 脚本，不直接改 initSchema）
ALTER TABLE transactions     ADD COLUMN user_id TEXT;
ALTER TABLE installments     ADD COLUMN user_id TEXT;
ALTER TABLE fixed_expenses   ADD COLUMN user_id TEXT;
ALTER TABLE shopping_plans   ADD COLUMN user_id TEXT;
ALTER TABLE categories       ADD COLUMN user_id TEXT;
ALTER TABLE payment_methods  ADD COLUMN user_id TEXT;

-- 3. 回填：现有数据归属首个 admin 用户
UPDATE transactions     SET user_id = (SELECT id FROM users WHERE role='admin' LIMIT 1) WHERE user_id IS NULL;
-- ... 其余表同理

-- 4. 加 NOT NULL 约束（SQLite 不支持直接改列约束，需重建表）
-- 用「创建新表 → 复制数据 → DROP 旧表 → RENAME」的标准迁移手法

-- 5. 索引：所有查询都按 user_id 过滤
CREATE INDEX idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX idx_transactions_user_type ON transactions(user_id, type);
-- 其余业务表同理
```

> **关键约束**：迁移脚本必须用事务包裹，并在 `data/` 备份后执行。SQLite 不支持 DROP COLUMN，回滚靠备份。

#### 4.2.2 仓库层强制注入

改造 `transactionRepository`，所有方法都接受 `userId` 参数：

```typescript
class TransactionRepository {
  list(userId: string, query: TransactionQuery = {}): Transaction[] {
    const { whereClause, params } = this.buildFilter(query);
    // 关键：user_id 永远是第一个条件
    const sql = `SELECT * FROM transactions WHERE user_id = ? ${whereClause ? 'AND ' + whereClause.replace('WHERE ', '') : ''} ORDER BY date DESC`;
    return db.prepare(sql).all(userId, ...Object.values(params));
  }

  create(userId: string, input: TransactionInput): Transaction {
    // INSERT 必须包含 user_id
    db.prepare(`INSERT INTO transactions (id, user_id, ...) VALUES (?, ?, ...)`).run(id, userId, ...);
  }

  update(userId: string, id: string, input): Transaction | undefined {
    // 关键：UPDATE/DELETE 必须带 user_id 防越权
    db.prepare(`UPDATE transactions SET ... WHERE id = ? AND user_id = ?`).run(..., id, userId);
  }

  delete(userId: string, id: string): boolean {
    const r = db.prepare(`DELETE FROM transactions WHERE id = ? AND user_id = ?`).run(id, userId);
    return r.changes > 0;
  }
}
```

#### 4.2.3 controller 层透传

```typescript
// transactionController.ts
export function listTransactions(req: Request, res: Response) {
  const list = transactionRepository.list(req.user.id, req.query);  // user.id 来自 JWT
  res.json({ success: true, data: list });
}
```

#### 4.2.4 防漏写的工程保障

1. **代码审查清单**：所有 SQL 必须 grep `WHERE.*user_id`，缺失即拒绝合并。
2. **单元测试**：每张表都写「用户 A 不能查/改/删用户 B 数据」的测试用例。
3. **静态规则**：可在 CI 加一条自定义 lint 规则，禁止单纯 `WHERE id = ?`（必须带 user_id）。

---

## 五、反向代理与 SSL/TLS

### 5.1 部署拓扑

```
外网 ──HTTPS:443──> Nginx ──HTTP:3001──> Express（systemd）
                        │
                        └─ 静态资源 dist/（也由 Nginx 直接服务，绕开 Node）
```

**Express 端口 3001 仅监听 127.0.0.1**，不暴露到公网。所有外网流量必须经 Nginx。

### 5.2 Nginx 配置要点

```nginx
server {
    listen 443 ssl http2;
    server_name money.example.com;

    # === TLS ===
    ssl_certificate     /etc/letsencrypt/live/money.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/money.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # === HSTS：强制后续都走 HTTPS ===
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # === 安全响应头（Nginx 层兜底，应用层 helmet 双保险）===
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # === 速率限制 ===
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=1r/s;

    # === 认证接口更严格 ===
    location ~ ^/api/v1/auth/(login|register)$ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://127.0.0.1:3001;
        include /etc/nginx/snippets/proxy-headers.conf;
    }

    # === API 通用限速 ===
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3001;
        include /etc/nginx/snippets/proxy-headers.conf;
    }

    # === 静态资源直接由 Nginx 服务 ===
    location / {
        root /opt/money-tracker/dist;
        try_files $uri $uri/ /index.html;
    }
}

# === HTTP 强制跳转 HTTPS ===
server {
    listen 80;
    server_name money.example.com;
    return 301 https://$host$request_uri;
}
```

`/etc/nginx/snippets/proxy-headers.conf`：

```nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
```

### 5.3 证书申请

- **Let's Encrypt**（免费、推荐）：`certbot --nginx -d money.example.com`。
- 自动续期：`systemctl enable certbot.timer`（默认每天检查，到期前 30 天自动续）。
- 商业证书/OV/EV 证书：如有合规需求可选。

### 5.4 Express 侧配合

```typescript
// app.ts
app.set('trust proxy', 1);  // 信任 Nginx 转发，让 req.ip 取到真实客户端 IP
```

不配这一行，所有 `req.ip` 都会是 `127.0.0.1`，rate-limit 和审计日志会失效。

---

## 六、外网安全措施

### 6.1 请求速率限制

**Nginx 层 + 应用层双重保险**：

| 层 | 工具 | 用途 |
|---|------|------|
| Nginx | `limit_req_zone` | 拦截最暴力的扫站（按 IP） |
| 应用 | `express-rate-limit` | 按 IP + 按 userId 双维度，更精细 |

```typescript
import rateLimit from 'express-rate-limit';

// 认证接口：极严格（防爆破）
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: '尝试次数过多，请稍后再试' },
});

// 通用 API
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
});

app.use('/api/v1/auth', authLimiter);
app.use('/api/v1', apiLimiter);
```

### 6.2 强制 HTTPS

三层保险：
1. Nginx HTTP → HTTPS 301 跳转（§5.2）。
2. Nginx HSTS 头（§5.2）。
3. 应用层 helmet 兜底（§6.4）。

### 6.3 CORS 跨域控制

**替换**当前的 `app.use(cors())`：

```typescript
import cors from 'cors';

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    const allowlist = (process.env.CORS_ALLOWLIST || 'http://localhost:5173').split(',');
    if (!origin || allowlist.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,                // 允许携带 Cookie（Refresh Token 需要）
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  maxAge: 86400,
};
app.use(cors(corsOptions));
```

**禁止**：`origin: '*'` 配合 `credentials: true`（浏览器会拒绝，且是典型安全漏洞）。

### 6.4 安全响应头（helmet）

```typescript
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind 需要
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
}));
```

### 6.5 SQL 注入防护

**核心原则**：100% 参数化查询，禁绝字符串拼接。

当前代码已经做得不错（`db.prepare(...).run(params)`），但有几处隐患需要修：

```typescript
// ❌ transactionRepository.ts 第 92 行：分页用了字符串拼接
pagination = `LIMIT ${query.pageSize} OFFSET ${offset}`;
// 若 query.pageSize 被注入特殊字符会出问题

// ✅ 改为参数化
pagination = `LIMIT ? OFFSET ?`;
db.prepare(`... ${pagination}`).all(..., query.pageSize, offset);
```

**额外规则**：
- 排序字段、表名、列名不可参数化 → 必须用白名单校验。
  ```typescript
  const SORT_FIELDS = new Set(['date', 'amount', 'created_at']);
  if (!SORT_FIELDS.has(query.sortBy)) throw new ValidationError('非法排序字段');
  ```
- 禁止任何 `db.exec(userInput)`。

### 6.6 XSS 防护

1. **输出过滤**：所有 API 响应统一经过 `JSON.stringify`，React 默认对 `{}` 插值做转义，前端不要用 `dangerouslySetInnerHTML`。
2. **输入校验**：用 `zod` 定义 schema，所有写接口强制校验。
   ```typescript
   import { z } from 'zod';
   const CreateTxSchema = z.object({
     date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
     amount: z.number().positive().max(1_000_000_000),
     type: z.enum(['income', 'expense']),
     category: z.string().min(1).max(50),
     note: z.string().max(200).optional(),
   });
   ```
3. **CSP 头**：§6.4 已禁用 inline script，阻断反射型 XSS。
4. **Cookie 安全**：`httpOnly` + `secure` + `sameSite=strict`，禁止 JS 读取。

### 6.7 敏感操作审计日志

新建 `audit_logs` 表，所有写操作落日志：

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  action     TEXT NOT NULL,          -- 'tx.create', 'user.login', 'config.update'
  target     TEXT,                    -- 操作对象 id
  ip         TEXT,
  user_agent TEXT,
  payload    TEXT,                    -- 关键字段快照（脱敏后）
  status     TEXT NOT NULL,           -- 'success' | 'failure'
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_user_time ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_action ON audit_logs(action);
```

中间件实现：

```typescript
export function auditLog(action: string) {
  return async (req, res, next) => {
    const oldJson = res.json.bind(res);
    res.json = (body) => {
      auditRepository.insert({
        userId: req.user?.id,
        action,
        target: req.params.id,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        status: res.statusCode < 400 ? 'success' : 'failure',
        payload: JSON.stringify(redactSensitive(req.body)),
      });
      return oldJson(body);
    };
    next();
  };
}

// 用法
router.post('/', auditLog('tx.create'), createTransaction);
```

敏感动作白名单（必须审计）：登录成功/失败、注册、改密、重置密码、用户禁用/启用、数据导出、批量删除。

### 6.8 登录异常检测 + IP 黑名单

```sql
CREATE TABLE IF NOT EXISTS login_attempts (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL,
  ip          TEXT NOT NULL,
  success     INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_login_ip_time ON login_attempts(ip, created_at);

CREATE TABLE IF NOT EXISTS ip_blacklist (
  ip          TEXT PRIMARY KEY,
  reason      TEXT,
  expires_at  TEXT,                  -- NULL = 永久
  created_at  TEXT NOT NULL
);
```

**自动封禁规则**：
- 同一 IP，5 分钟内失败 ≥ 10 次 → 自动加入黑名单 1 小时。
- 同一用户名，1 小时内失败 ≥ 5 次 → 锁定该用户 15 分钟。

```typescript
// middleware/ipGuard.ts
export async function ipGuard(req, res, next) {
  const blocked = await db.prepare(
    `SELECT 1 FROM ip_blacklist WHERE ip = ? AND (expires_at IS NULL OR expires_at > ?)`
  ).get(req.ip, new Date().toISOString());
  if (blocked) {
    return res.status(403).json({ success: false, message: 'IP 已被封禁' });
  }
  next();
}

// 放在 authenticate 之前
app.use('/api/v1/auth', ipGuard, authRoutes);
```

### 6.9 输入校验与输出过滤（汇总）

| 环节 | 措施 |
|------|------|
| 进入 | `express.json({ limit: '10mb' })` 限大小；`zod` 校验结构；正则约束格式 |
| 业务层 | 数值范围（amount > 0、≤ 1e9）、字符串长度、枚举值校验 |
| SQL 层 | 100% 参数化；白名单排序字段 |
| 输出 | 永远不返回 `password_hash` / `token`；响应包装 `{ success, data }` |
| 错误 | 不向客户端暴露堆栈（生产关 `err.stack`） |

### 6.10 接口鉴权中间件链（最终顺序）

`app.ts` 中的中间件**顺序敏感**，必须按下面来：

```typescript
app.set('trust proxy', 1);
app.use(helmet({...}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(ipGuard);                          // IP 黑名单
app.use('/api/v1', apiLimiter);            // 通用限速
app.use('/api/v1/auth', authLimiter);      // 认证限速
app.use('/api/v1', authenticate);          // 鉴权
app.use('/api/v1/admin', requireRole('admin'));  // RBAC
// ... 业务路由
```

---

## 七、依赖与配置变更

### 7.1 新增依赖

```bash
npm install bcrypt jsonwebtoken helmet express-rate-limit zod
npm install -D @types/bcrypt @types/jsonwebtoken
```

### 7.2 环境变量

新增 `.env`（**不进 git**）：

```bash
# 认证
JWT_SECRET=<至少 32 字节随机串，openssl rand -base64 48 生成>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d

# CORS
CORS_ALLOWLIST=https://money.example.com,http://localhost:5173

# 数据库
DB_PATH=./data/money.db

# 邮件（密码找回，可选）
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# 初始管理员（仅首次启动用）
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=<强密码>
```

---

## 八、完备性评估与补充要点

### 8.1 你列出的清单 vs 本方案覆盖情况

| 你提到的 | 覆盖章节 | 状态 |
|---------|---------|------|
| 用户注册 | §2.4 | ✓ |
| 登录 | §2.4 | ✓ |
| JWT/OAuth | §2.1, §2.5, §2.6 | ✓（OAuth 标注为可选） |
| 角色权限 | §3 | ✓ |
| 密码加密 | §2.1（bcrypt） | ✓ |
| 密码找回 | §2.5 | ✓ |
| 反代 + SSL | §5 | ✓ |
| 数据库隔离（逻辑/物理） | §4 | ✓ 含对比与选型 |
| 速率限制 | §6.1 | ✓ |
| HTTPS 强制 | §6.2 | ✓ |
| CORS | §6.3 | ✓ |
| SQL 注入防护 | §6.5 | ✓ |
| XSS 防护 | §6.6 | ✓ |
| 审计日志 | §6.7 | ✓ |
| 登录异常检测 + IP 黑名单 | §6.8 | ✓ |
| 鉴权中间件 | §3.2, §6.10 | ✓ |
| 输入校验 + 输出过滤 | §6.9 | ✓ |

### 8.2 你**遗漏但很重要**的补充点

| # | 要点 | 说明 |
|---|------|------|
| 1 | **密钥管理** | `JWT_SECRET` 不能硬编码；用环境变量或密钥管理服务（Vault/AWS Secrets Manager）。生产环境定期轮换。 |
| 2 | **数据库备份加密** | 当前 `data/money.db` 备份是明文。备份文件应加密（`gpg -c`）后再传输/存档，防止备份泄露 = 全量泄露。 |
| 3 | **CSRF 防护** | 用 Cookie 存 Refresh Token 后，必须防 CSRF。措施：`SameSite=Strict`（首选）或双重提交 Cookie。当前方案已用 `SameSite=Strict`，但要写明。 |
| 4 | **会话固定攻击** | 登录成功后必须重新生成会话标识（Refresh Token 换新）。 |
| 5 | **依赖漏洞扫描** | 加 `npm audit` 到 CI，定期 `npm outdated`。better-sqlite3、express 历史上有 CVE。 |
| 6 | **错误信息泄露** | 生产环境禁止把 `err.stack` 返给客户端；统一错误处理中间件只返回通用错误信息。 |
| 7 | **文件上传** | 当前无文件上传。如果未来支持导入图片凭证，必须限制类型/大小、重命名存储、独立子域服务（隔离 Cookie）。 |
| 8 | **HTTP 方法白名单** | Nginx/Express 都应拒绝 TRACE/CONNECT 等非业务方法。 |
| 9 | **目录列表禁用** | Nginx `autoindex off`；Express 不暴露 `data/` 目录。 |
| 10 | **日志脱敏** | 审计日志、应用日志里禁止出现明文密码、token、卡号。统一 `redactSensitive()` 工具。 |
| 11 | **bcrypt 密码长度上限** | bcrypt 设计上限 72 字节。在哈希前校验 `password.length ≤ 72`，否则截断会引发安全错觉。 |
| 12 | **账户枚举防护** | 注册/找回时返回通用错误（"如该用户存在，已发送邮件"），不暴露"用户名不存在"。 |
| 13 | **时间攻击** | 密码比对用 `bcrypt.compare`（恒定时间）；登录失败也走完整哈希流程避免时序差。 |
| 14 | **管理员双因素** | admin 账户建议加 TOTP（`otplib`），尤其外网暴露时。 |
| 15 | **数据库文件权限** | Linux 上 `chmod 600 data/money.db`，owner = systemd 服务用户，禁止其他用户读。 |
| 16 | **时区一致性** | 全程 UTC 存 ISO 字符串（当前代码已这么做）；前端按用户本地时区显示。避免跨时区账目错位。 |
| 17 | **API 版本化** | 当前 `/api/v1/` 已具备；新增破坏性改动走 `/api/v2/`，避免客户端被打断。 |
| 18 | **健康检查不暴露内部信息** | `/api/health` 当前返回 `{ success: true }`，保持这个简单状态，不要泄露版本号/数据库状态给外网。 |
| 19 | **DoS 大请求体** | 已有 `express.json({ limit: '10mb' })`，但批量接口建议更严（如批量导入限 1MB）。 |
| 20 | **SQLite 并发写入** | WAL 模式已开，但多用户并发写仍可能 `SQLITE_BUSY`。better-sqlite3 是同步阻塞，单进程下没问题；若日后多进程，需 `WAL` + `busy_timeout`。 |

### 8.3 实施优先级建议

按风险与改动量排序：

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| P0 立即 | 反代 + SSL + Express 仅监听 127.0.0.1 | ⚠️ 现在外网直连 = 裸奔 |
| P0 立即 | helmet + CORS 白名单 + rate-limit | 半天搞定 |
| P0 立即 | 修掉分页 LIMIT 字符串拼接（§6.5） | 1 小时 |
| P1 本周 | users 表 + bcrypt + JWT 双 Token + 鉴权中间件 | 2-3 天 |
| P1 本周 | 业务表加 user_id + 仓库层改造 + 单测 | 2-3 天 |
| P2 本月 | RBAC + 审计日志 + IP 黑名单 + 登录异常检测 | 2-3 天 |
| P2 本月 | 密码找回（邮箱或 admin 重置） | 1 天 |
| P3 后续 | zod 全面校验、备份加密、依赖扫描 CI、admin TOTP | 持续 |

---

## 九、总结

本方案围绕 Money_Book 的实际现状（SQLite 单文件、Express 单进程、controller/service/repository 三层、已有 systemd 部署）做最小侵入的改造：

- **认证**：bcrypt + JWT 双 Token，短命 Access + 落库可吊销 Refresh。
- **权限**：user / admin 两级 RBAC，admin 不可见用户明细（隐私底线）。
- **隔离**：选逻辑隔离（user_id 行级），配合仓库层强制注入 + 单测覆盖。
- **反代**：Nginx + Let's Encrypt + HSTS，Express 仅监听 127.0.0.1。
- **安全**：helmet + CORS 白名单 + 双层 rate-limit + IP 黑名单 + 审计日志 + zod 校验 + 100% 参数化 SQL。

**你列出的清单已经相当完整**，本方案在此基础上补充了密钥管理、CSRF、备份加密、依赖扫描、错误信息脱敏、bcrypt 长度上限、账户枚举防护、时间攻击、管理员 2FA、文件权限等 20 个容易被忽略的要点。

建议从 P0 开始：先上反代+SSL+helmet+CORS+rate-limit（半天工作量），堵住当前外网裸奔的风险口，再分阶段推进认证与隔离。
