# Money Tracker · 个人记账应用

一个功能齐全的个人记账网页应用，前后端分离架构，单端口部署。记录日常收支、自定义分类与支付方式、生成可视化统计图表，并内置一套 **Agent-Friendly** 的 RESTful API。

---

## 目录

- [项目特性](#项目特性)
- [单账号登录](#单账号登录)
  - [鉴权方式](#鉴权方式)
  - [会话有效期](#会话有效期)
  - [API Token（AI Agent 接入）](#api-tokenai-agent-接入)
- [财务规划 API（新增）](#财务规划-api新增)
  - [鉴权说明](#鉴权说明)
- [Linux 部署](#linux-部署)
  - [1. 安装 Node.js](#1-安装-nodejs)
  - [2. 部署项目](#2-部署项目)
  - [3. 环境变量配置（.env）](#3-环境变量配置env)
  - [4. 使用 systemd 守护进程](#4-使用-systemd-守护进程)
  - [5. Nginx 反向代理（可选）](#5-nginx-反向代理可选)
  - [6. 防火墙](#6-防火墙)
  - [7. 升级、备份与恢复](#7-升级备份与恢复)
- [端口配置](#端口配置)
  - [生产模式（单端口）](#生产模式单端口)
  - [开发模式（前后端分离端口）](#开发模式前后端分离端口)
  - [修改端口示例](#修改端口示例)
- [使用说明](#使用说明)
  - [记一笔](#记一笔)
  - [管理分类](#管理分类)
  - [管理支付方式](#管理支付方式)
  - [批量导入账单](#批量导入账单)
  - [筛选与查看账单](#筛选与查看账单)
  - [仪表盘](#仪表盘)
  - [财务规划（分期 / 固定支出 / 购物计划）](#财务规划分期--固定支出--购物计划)
  - [预算对比报表](#预算对比报表)
  - [账单总览](#账单总览)

---

## 项目特性

- **记账**：日期 / 金额 / 类型（收入、支出）/ 分类 / 支付方式 / 备注
- **账单列表**：按月份、类型、支付方式筛选，支持单条编辑、删除
- **批量导入**：CSV 模板填写后一键导入，错误跳过并详细反馈
- **仪表盘**：年度视图（月度趋势图 + 汇总表）+ 月度视图（摘要卡 + 分类/支付方式图表 + 当月明细）
- **财务规划**（新增）：
  - **分期计算器**：支持车贷/房贷/电子产品分期，等额本息/等额本金两种方式，根据本金、利率、期数计算每月还款；可将当月应还款一键自动计入支出交易
  - **固定支出管理**：维护每月固定开销清单（网费、水费、电费、物业费等），支持启用/停用、自定义金额与图标，自动纳入每月预算
  - **购物计划**：登记下月计划购买物品，含名称、预计花费、优先级（高/中/低）、计划月份，自动纳入对应月份的预计支出；支持「标记已购」回填实际花费
- **预算对比报表**（新增）：按月/按年生成「预计支出（固定+分期+计划）vs 实际支出」对比，含可视化柱状图与逐项差异明细（超支/节省一目了然）
- **账单总览**（新增）：某月综合账单，逐项对比预计与实际，按差异绝对值排序，直观看出哪一项超预算最多
- **管理后台**：可视化新增/删除分类（按收入/支出分组）、支付方式，内置图标选择器（按主题分组，支持搜索）
- **数据持久化**：SQLite 单文件存储（`data/money.db`），WAL 模式，零配置

---

## 单账号登录

> v0.2.0 新增。应用现在需要登录后才能使用。

本系统自 v0.2.0 起引入单账号登录机制，所有 API 请求和前端页面均需身份验证。配置方法见下方「[环境变量配置](#3-环境变量配置env)」。

### 鉴权方式

支持两种鉴权方式，满足任一即可：

**方式 1：浏览器 Cookie（Web UI）**

首次访问会自动跳转到登录页，输入密码后自动创建 session。之后所有请求自动携带 Cookie，无需额外操作。

**方式 2：Bearer Token（AI Agent / 程序化调用）**

适用于 OpenClaw、Hermes、Dify、Coze、curl 等程序化调用场景。配置 `AGENT_API_TOKEN` 后，在请求头中携带：

```bash
curl -H "Authorization: Bearer <AGENT_API_TOKEN>" \
     http://<服务器IP>:3001/api/v1/transactions
```

> ⚠ Token 和 Cookie 两种方式互斥，同一请求只需其一即可。

### 会话有效期

- **默认**：20 分钟滑动过期
- **行为**：活跃用户每次 API 请求自动续期，闲置超过 20 分钟才自动登出
- **配置**：通过环境变量 `SESSION_TTL_MINUTES` 修改（单位：分钟）

### API Token（AI Agent 接入）

为方便 Agent 长期调用，推荐配置一个 **长期有效的 API Token**（不走过期机制）：

1. 在服务器上生成随机 Token：
   ```bash
   openssl rand -hex 32
   ```
2. 将输出写入 `.env` 文件的 `AGENT_API_TOKEN=` 字段
3. 配置后 Agent 直接使用 `Authorization: Bearer <token>` 调用所有 API，**无需每次先登录**

> 💡 此 Token 是静态长期凭证，请妥善保管。如需轮换，更新 `.env` 后重启服务即可。

---

## 财务规划 API（新增）

> **鉴权说明**：v0.2.0 起，所有 `/api/v1/*` 业务接口均需鉴权。两种方式选一：
> - **浏览器**：先登录 → Cookie 自动携带，无需额外处理
> - **程序化调用**：在请求头加 `Authorization: Bearer <AGENT_API_TOKEN>`（推荐），或先调 `/api/v1/auth/login` 拿到 Cookie
>
> 详细配置见上方「[单账号登录](#单账号登录)」章节。

所有接口前缀 `/api/v1`，响应格式统一为 `{ success, data, message }`。

### 分期管理 `/installments`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/installments` | 列出全部分期 |
| `POST` | `/installments` | 新建分期（自动计算月供/总利息/总还款） |
| `POST` | `/installments/calc` | 仅试算不入库，入参 `{ principal, annualRate, termMonths, method }` |
| `POST` | `/installments/post-monthly?month=YYYY-MM` | 把当月所有进行中分期的应还款自动写入交易（幂等） |
| `GET/PUT/DELETE` | `/installments/:id` | 单条查询/更新/删除 |

**新建分期请求体示例**：
```json
{
  "name": "车贷-比亚迪汉",
  "kind": "car",
  "method": "equal_payment",
  "principal": 150000,
  "annualRate": 4.75,
  "termMonths": 36,
  "startMonth": "2026-07",
  "category": "交通",
  "paymentMethod": "银行卡",
  "note": "可选"
}
```
> `kind`：`car` / `house` / `electronics` / `other`；`method`：`equal_payment`（等额本息）/ `equal_principal`（等额本金）。

### 固定支出 `/fixed-expenses`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/fixed-expenses` | 列出全部；带 `?month=YYYY-MM` 只返回该月生效项 |
| `POST` | `/fixed-expenses` | 新建（`{ name, amount, category, paymentMethod, icon, enabled, startMonth, note }`） |
| `GET/PUT/DELETE` | `/fixed-expenses/:id` | 单条查询/更新/删除 |

### 购物计划 `/shopping-plans`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/shopping-plans` | 列出全部；带 `?month=YYYY-MM` 只返回该月计划 |
| `POST` | `/shopping-plans` | 新建（`{ name, estimatedCost, priority, planMonth, category, paymentMethod, note }`） |
| `PATCH` | `/shopping-plans/:id/purchase` | 标记为已购买，可传 `{ actualCost?, purchasedDate? }` 回填实际花费 |
| `GET/PUT/DELETE` | `/shopping-plans/:id` | 单条查询/更新/删除 |

> `priority`：`high` / `medium` / `low`。`planMonth` 为计划购买月份 `YYYY-MM`，自动纳入该月预计支出。

### 预算对比报表 `/bills`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/bills/budget-monthly?month=YYYY-MM` | 月度预算对比（预计=固定+分期+计划；实际=该月支出交易聚合） |
| `GET` | `/bills/budget-yearly?year=YYYY` | 年度预算对比，含逐月明细数组 |
| `GET` | `/bills/overview?month=YYYY-MM` | 账单总览：逐项对比预计 vs 实际，按差异排序 |

**月度预算对比响应示例**：
```json
{
  "month": "2026-07",
  "projectedExpense": 5200.00,
  "actualExpense": 4850.50,
  "diff": -349.50,
  "projectedItems": [
    { "source": "fixed", "refId": "...", "name": "网费", "category": "居住", "amount": 100.00, "icon": "wifi" },
    { "source": "installment", "refId": "...", "name": "车贷", "category": "交通", "amount": 4500.00, "icon": "car" },
    { "source": "plan", "refId": "...", "name": "新手机", "category": "购物", "amount": 600.00, "icon": "shopping-bag", "priority": "high" }
  ],
  "actualItems": [
    { "category": "餐饮", "icon": "utensils", "amount": 1200.00, "count": 28 }
  ]
}
```
> `diff` 为正=超支，为负=节省。

---

## Linux 部署

> 适用于 Ubuntu / Debian / CentOS / RHEL / Fedora 等主流发行版。

### 1. 安装 Node.js

**Ubuntu / Debian**（推荐 NodeSource 安装 Node.js 20 LTS）：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证
node -v   # 应输出 v20.x.x
npm -v    # 应输出 10.x.x
```

**CentOS / RHEL / Fedora**：

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs      # CentOS/RHEL 用 yum/dnf
```

> 需要 Node.js ≥ 18，推荐 20 LTS 或 22 LTS。

### 2. 部署项目

```bash
# 假设项目放在 /opt/money-tracker
sudo mkdir -p /opt/money-tracker
sudo chown $USER:$USER /opt/money-tracker

# 拷贝代码（或 git clone 你的仓库）
cp -r . /opt/money-tracker/
cd /opt/money-tracker

# 安装依赖
npm install

# 生成登录密码（交互式，输入不回显）
npm run gen-password
# 把输出的哈希保存到 .env 的 APP_PASSWORD_HASH=

# 复制环境变量模板并编辑
cp .env.example .env
nano .env
# 至少填入：APP_PASSWORD_HASH、AGENT_API_TOKEN（可选）

# 构建前端到 dist/
npm run build

# （可选）删除开发依赖以减小体积
npm prune --omit=dev

# 启动（前台测试）
npm start
# → 输出 "Server ready on port 3001"
# → 首次访问自动跳转到 /login
```

浏览器访问 `http://<服务器IP>:3001/`，即可看到前端页面；API 在 `http://<服务器IP>:3001/api/v1/`。

> **端口**：可通过环境变量 `PORT=80 npm start` 修改。

> **注意**：`npm prune --omit=dev` 后若需重新构建，必须再次执行 `npm install`。

### 3. 环境变量配置（.env）

首次部署时，在项目根目录创建 `.env` 文件（复制 `.env.example` 后修改）：

```bash
cd /opt/money-tracker
cp .env.example .env
```

#### 必填变量

| 变量 | 说明 | 生成方式 |
|------|------|---------|
| `APP_PASSWORD_HASH` | bcrypt 密码哈希（登录密码） | `npm run gen-password` 交互式生成，或 `printf '你的密码\n你的密码\n' \| npm run gen-password` 脚本化 |

#### 强烈推荐变量

| 变量 | 说明 | 生成方式 |
|------|------|---------|
| `AGENT_API_TOKEN` | AI Agent 长期 API Token（见[单账号登录](#api-tokenai-agent-接入)） | `openssl rand -hex 32` |

#### 可选变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 绑定的网卡 IP；内网部署建议设为具体 IP，如 `192.168.1.10` |
| `SESSION_TTL_MINUTES` | `20` | Web UI 会话有效期（分钟），滑动过期 |
| `COOKIE_SECURE` | `false` | Cookie 是否仅 HTTPS 传输；有 HTTPS 反代时设 `true` |
| `DB_PATH` | `./data/money.db` | 数据库文件路径，一般无需修改 |

#### 完整示例

```bash
# .env
APP_PASSWORD_HASH=$2a$12$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijk
AGENT_API_TOKEN=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
PORT=3001
HOST=192.168.1.10
SESSION_TTL_MINUTES=20
COOKIE_SECURE=false
```

> ⚠ `.env` 包含敏感信息，**必须加入 `.gitignore`** 禁止提交到 Git。
> 默认 `.gitignore` 已排除 `.env`，请勿手动删除该规则。

### 4. 使用 systemd 守护进程

创建 `/etc/systemd/system/money-tracker.service`：

```ini
[Unit]
Description=Money Tracker App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/money-tracker
# 加载 .env 配置文件（- 前缀表示文件可缺失，不影响启动）
EnvironmentFile=-/opt/money-tracker/.env
Environment=NODE_ENV=production
Environment=PORT=3001
# HOST=0.0.0.0  # 若需绑定具体网卡，取消注释并设置
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启动并设置开机自启：

```bash
sudo systemctl daemon-reload
sudo systemctl enable money-tracker
sudo systemctl start money-tracker

# 查看状态
sudo systemctl status money-tracker

# 实时查看日志
sudo journalctl -u money-tracker -f
```

常用管理命令：

```bash
sudo systemctl restart money-tracker   # 重启（更新代码后）
sudo systemctl stop money-tracker      # 停止
sudo systemctl disable money-tracker   # 取消开机自启
```

### 5. Nginx 反向代理（可选）

如果希望使用 80/443 端口或配置 HTTPS，可加一层 Nginx：

```nginx
server {
    listen 80;
    server_name your.domain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

安装 Nginx：

```bash
sudo apt-get install -y nginx          # Debian/Ubuntu
sudo yum install -y nginx              # CentOS/RHEL
```

### 6. 防火墙

```bash
# 仅暴露 80（若用 Nginx）
sudo ufw allow 80/tcp

# 或直接暴露 3001（不使用 Nginx）
sudo ufw allow 3001/tcp

# 启用防火墙（如尚未启用）
sudo ufw enable
```

> CentOS 默认使用 `firewalld`，命令为 `sudo firewall-cmd --permanent --add-port=3001/tcp && sudo firewall-cmd --reload`。

### 7. 升级、备份与恢复

**升级到新版本**：

```bash
cd /opt/money-tracker

# 1. 备份数据库（强烈建议）
cp data/money.db data/money-backup-$(date +%Y%m%d).db

# 2. 拉取新代码 / 覆盖文件
# git pull origin main
# 或：scp -r ./new-version/* user@server:/opt/money-tracker/

# 3. 重装依赖（package.json 可能变更）
npm install

# 4. 重新构建前端
npm run build

# 5. 重启服务
sudo systemctl restart money-tracker
```

**定时备份数据库**（备份脚本）：

项目提供定时备份脚本 `scripts/money_db_backup.sh`，使用 `VACUUM INTO` 不停服生成单文件快照：

```bash
# 1. 编辑脚本，确认备份路径
#    修改 DB_DIR 和 BACKUP_DIR 为你的实际目录
nano scripts/money_db_backup.sh

# 2. 手动执行一次测试
bash scripts/money_db_backup.sh

# 3. 注册 cron 定时任务（每天凌晨 3 点）
crontab -e
# 添加一行：
0 3 * * * /opt/money-tracker/scripts/money_db_backup.sh
```

默认配置（实际部署须修改）：

| 变量 | 示例值 | 说明 |
|------|--------|------|
| `DB_DIR` | `/opt/money-tracker/data` | 数据库文件所在目录 |
| `BACKUP_DIR` | `/root/synology/money_db_bak` | 备份文件存放目录 |
| `RETENTION_DAYS` | `7` | 备份保留天数，超期自动删除 |

**从备份恢复数据库**（恢复脚本）：

使用 `scripts/money_db_restore.sh` 交互式恢复：

```bash
# 1. 编辑脚本，修改 DEPLOY_DIR 和 BACKUP_DIR 为你的实际目录
nano scripts/money_db_restore.sh

# 2. 执行恢复（会列出所有可用的备份文件供选择）
bash scripts/money_db_restore.sh
```

恢复脚本会：

1. 列出备份目录下所有可用的 `.db` 快照并按时间排序
2. 提示输入编号选择要恢复的备份
3. 检查 money-tracker 服务是否在运行（运行中会询问是否停止）
4. **自动备份当前数据库**到备份目录（`pre-restore-auto-*`），留后悔药
5. 从备份目录拷贝选中文件到 `data/money.db`
6. 清理 WAL/SHM 锁文件
7. 提示手动重启服务

> ⚠ 恢复前必须停止服务（脚本会自动提示并询问操作）。
> 首次使用恢复脚本前，务必编辑脚本头部的 `DEPLOY_DIR` 和 `BACKUP_DIR` 变量。

**清空数据重新初始化**（重置所有数据，停止服务后执行）：

```bash
sudo systemctl stop money-tracker
rm data/money.db data/money.db-shm data/money.db-wal
sudo systemctl start money-tracker
# → 服务启动时检测到数据库为空，会自动建表并写入演示数据
```

---

## 端口配置

应用在不同运行模式下端口的语义和修改方式不同，下表先给概览，再分模式说明。

| 模式 | 默认端口 | 提供内容 | 修改方式 |
|---|---|---|---|
| **生产**（`npm start`） | `3001` | 前端 + API 同端口 | 环境变量 `PORT` |
| **开发**（`npm run dev`） | 前端 `5173` / 后端 `3001` | 前端通过 Vite proxy 转发 `/api` 到后端 | `vite.config.ts` 的 `server.port` + 后端 `PORT` |

### 生产模式（单端口）

生产模式下后端进程**同时托管**前端静态资源（`dist/`）和 API，只需配置一个端口：

```bash
# 默认 3001
npm start

# 改为 8080
PORT=8080 npm start

# 改为 80（需 root 权限）
sudo PORT=80 npm start
```

**systemd 服务**中修改端口（编辑 `/etc/systemd/system/money-tracker.service`）：

```ini
[Service]
Environment=PORT=8080                    # ← 修改这一行
ExecStart=/usr/bin/npm start
```

修改后重载：

```bash
sudo systemctl daemon-reload
sudo systemctl restart money-tracker
```

> 💡 想用 80/443 端口 + HTTPS，推荐用 Nginx 反代（见上文「Nginx 反向代理」章节），让应用保持监听 3001，由 Nginx 接管对外端口。

### 开发模式（前后端分离端口）

开发模式下 Vite 与后端各起一个进程，前端 `5173` 通过 proxy 把 `/api` 转发到后端 `3001`。

**修改后端端口**：

```bash
# 1. 启动时用环境变量覆盖（推荐）
PORT=4000 npm run dev

# 2. 同时必须修改前端 Vite 的 proxy 目标
#    编辑 vite.config.ts，把 target 从 http://localhost:3001 改为 http://localhost:4000
```

**修改前端 Vite 端口**：

编辑 `vite.config.ts`：

```typescript
server: {
  port: 5173,                            // ← 修改为想要的端口，如 3000
  proxy: {
    '/api': {
      target: 'http://localhost:3001',   // ← 后端端口，需与 PORT 一致
      changeOrigin: true,
      secure: false,
    },
  },
},
```

> ⚠️ 开发模式下若前后端端口都改了，**必须同步修改 `vite.config.ts` 的 `server.port` 和 `proxy./api.target`**，否则前端无法访问 API。

### 修改端口示例

**场景 1：生产环境用 8080 端口**

```bash
PORT=8080 npm start
# 访问 http://<服务器IP>:8080/
```

**场景 2：生产环境 + Nginx + HTTPS（推荐）**

应用监听 3001，Nginx 监听 443 转发：

```nginx
server {
    listen 443 ssl;
    server_name money.example.com;
    ssl_certificate     /etc/letsencrypt/live/money.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/money.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;       # ← 应用端口
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**场景 3：开发时同时改两个端口**

```bash
# 1. 先编辑 vite.config.ts：
#    - server.port 改为想要的前端端口（如 3000）
#    - proxy./api.target 改为后端端口（如 4001）

# 2. 终端 1：起后端（用 nodemon 监听 ts 改动）
PORT=4001 npm run server:dev

# 3. 终端 2：起前端
npm run client:dev
```

> `npm run dev` 会用 concurrently 把 `client:dev` 与 `server:dev` 同时跑起。如果想分别控制（例如改端口、单独看日志），用上面两条命令拆开运行即可。

**端口被占用怎么办**：

```bash
# 查看占用进程
lsof -nP -iTCP:3001 -sTCP:LISTEN        # macOS / Linux
# 或
ss -lntp | grep 3001                    # Linux

# 杀掉占用进程
lsof -ti:3001 | xargs kill -9

# 或换一个端口启动
PORT=3002 npm start
```

---

## 使用说明

启动后浏览器访问应用，左侧导航包含六个入口：**仪表盘** / **全部账单** / **财务规划** / **预算报表** / **账单总览** / **管理**。移动端为底部 Tab 切换。

### 记一笔

在「仪表盘」或「全部账单」页面，点击右上角的「**记一笔**」按钮：

1. **选择类型**：支出 / 收入（默认支出）
2. **填写金额**：数字，支持两位小数（如 `35.50`）
3. **选择日期**：默认今天，可改为任意日期
4. **选择分类**：从已配置的分类中选（如「餐饮」「工资」）
5. **选择支付方式**：从已配置的支付方式中选（如「支付宝」「银行卡」）
6. **填写备注**（可选）：如「聚餐」「7月工资」
7. 点击「**保存**」

> 💡 **提示**：分类和支付方式必须先在「管理」页面配置好，否则下拉框为空。

### 管理分类

进入「**管理**」页面，分为「**收入分类**」和「**支出分类**」两个独立面板。

**新增分类**：

1. 在对应面板（收入 / 支出）的输入框中填写：
   - **分类名称**：≤ 20 个字符，如「副业」「育儿」
   - **图标**：点击图标框打开选择器，按分组浏览（收入 / 餐饮 / 交通 / 购物 等），或搜索关键词
2. 点击「**添加**」

**删除分类**：

- 点击分类标签右侧的垃圾桶图标
- ⚠️ 如果该分类**已被交易引用**，将无法删除（系统会提示有多少条交易在用）。需先迁移或删除相关交易。

**关于图标选择器**：

- 内置 60+ 个主题图标，按 11 个语义分组（收入 / 餐饮 / 交通 / 购物 / 居家 / 娱乐 / 医疗 / 教育 / 旅行 / 家庭 / 其他）
- 顶部搜索框支持中英文：输入「餐饮」或 `utensils` 都能找到对应图标
- 点击任意图标立即选中，再次点击输入框可关闭

### 管理支付方式

在「管理」页面下方的「**支付方式**」面板。

**新增支付方式**：

1. 输入「**支付方式名称**」：≤ 20 个字符，如「京东白条」「花呗」「信用卡」
2. 选择图标（与分类共用同一图标库）
3. 点击「**添加**」

**删除支付方式**：

- 同样受引用检查保护，被交易引用的支付方式无法删除

> 💡 **建议**：常见支付方式的图标推荐 — 银行卡/信用类用 `landmark`，钱包类（支付宝/微信/抖音月付）用 `wallet`。

### 批量导入账单

适合一次性导入历史账单（如从其他记账软件迁移、补录多月数据）。

#### 步骤

1. 进入「**全部账单**」页面，点击右上角「**批量导入**」按钮
2. 在弹窗中点击「**下载模板**」，获取 `transactions_template.csv`
3. 用 Excel / WPS / Numbers / VSCode 打开模板
4. **清空示例数据**（保留第一行表头），按列填写自己的账单
5. **保存为 CSV UTF-8 编码**（关键步骤，详见下方注意事项）
6. 回到浏览器，点击上传区域选择文件，或直接拖拽 CSV 到上传区
7. 系统解析后展示：可导入记录数 / 解析错误数
8. 点击「**确认导入 N 条**」

#### 模板字段说明

| 列名 | 必填 | 格式 | 示例 | 说明 |
|---|---|---|---|---|
| 日期 | ✅ | YYYY-MM-DD | `2026-07-19` | 必须是真实有效日期 |
| 类型 | ✅ | income / expense | `expense` | 也支持中文「收入」/「支出」 |
| 分类 | ✅ | 字符串 | `餐饮` | **必须与「管理」页面已配置的分类名一致** |
| 金额 | ✅ | 数字 | `35.50` | 大于 0，支持两位小数 |
| 支付方式 | ✅ | 字符串 | `支付宝` | **必须与「管理」页面已配置的支付方式一致** |
| 备注 | ❌ | 字符串 | `公司楼下午饭` | 可留空 |

#### 模板示例（前 5 行）

```csv
日期,类型,分类,金额,支付方式,备注
2026-07-01,expense,餐饮,35.50,支付宝,公司楼下午饭
2026-07-02,expense,交通,8.00,微信,地铁通勤
2026-07-05,expense,购物,199.00,银行卡,买衣服
2026-07-10,income,工资,12000.00,银行卡,7月工资
2026-07-15,expense,娱乐,88.00,微信,看电影
```

#### ⚠️ 注意事项

**1. 分类与支付方式必须预先配置**

CSV 中的「分类」和「支付方式」必须**完全匹配**管理页面中已存在的名称（区分大小写）。如果 CSV 写了「旅行」，但管理页面只有「旅游」，该行会被跳过并报错：`category 不合法：旅行`。

→ **建议**：导入前先到「管理」页面把所有需要的分类和支付方式添加齐全。

**2. CSV 编码必须为 UTF-8**

Excel 在中文 Windows 下默认保存为 GBK，会导致中文乱码。请按以下方式保存：

- **Excel**：文件 → 另存为 → 文件类型选「**CSV UTF-8 (逗号分隔) (*.csv)**」
- **WPS**：另存为 → 编码选「**UTF-8**」
- **Numbers**：导出 → CSV → 编码选「**UTF-8**」
- **VSCode**：右下角点击编码 → 选「**UTF-8**」保存

**3. 金额格式**

- ✅ 正确：`35.5`、`35.50`、`12000`
- ❌ 错误：`¥35.50`（带货币符号）、`1,000`（千分位）、`-50`（负数）、`abc`（非数字）

**4. 日期必须真实存在**

系统会严格校验日期合法性，拒绝如 `2026-02-30`、`2026-13-01` 这样的伪日期。

**5. 错误处理（容错）**

导入采用**逐行校验 + 跳过错误行**策略：

- 某一行数据有问题时，**仅跳过该行**，不会中断后续导入
- 完成后会返回详细错误列表：第几行、什么错误
- 例如：导入 30 行，其中第 5 行分类不存在、第 12 行金额为 0 → 28 条成功，2 条失败
- 修正错误行后**重新导入整个文件**即可（已成功的行需自行删除避免重复）

### 筛选与查看账单

在「**全部账单**」页面：

**桌面端**：顶部筛选栏，可按 **月份 / 类型 / 支付方式** 任意组合筛选，右侧实时显示收入与支出汇总。

**移动端**：点击顶部筛选摘要卡片，从底部弹出筛选抽屉，操作完成后点击「查看结果」。

**单条操作**：每条账单可点击编辑（铅笔图标）或删除（垃圾桶图标）。删除前会弹确认框，避免误删。

### 仪表盘

「**仪表盘**」页面提供两种视图，点击顶部 Tab 切换：

**年度视图**：

- 三张摘要卡：年度收入 / 支出 / 结余（含储蓄率）
- 月度收支趋势图：柱状图展示每月收入（绿）与支出（红），折线为结余
- 支出分类占比饼图：按分类汇总年度支出
- 支付方式分布柱状图：按支付方式汇总年度支出
- 按月汇总明细表：每月收入/支出/结余/储蓄率

**月度视图**：

- 月份切换：左右箭头或下拉选择最近 12 个月
- 三张摘要卡：本月收入 / 支出 / 结余
- 当月支出分类占比 + 支付方式分布
- 当月账单明细列表（默认显示前 10 条，可点击「查看全部」跳转）

> 💡 **配色约定**：本应用遵循通用财务展示习惯——**收入用绿色、支出用红色**。注意这与 A 股「涨红跌绿」恰好相反；如果你更习惯股市配色，可在「管理」页面自行调整。


### 财务规划（分期 / 固定支出 / 购物计划）

进入「**财务规划**」页面，顶部有三个 Tab 切换：

**分期计算器**：

1. 在「分期试算」卡片输入 **本金 / 年利率 / 期数**，选择 **还款方式**（等额本息 / 等额本金），实时显示每月还款、总利息、总还款
2. 点击「**精确计算**」可调用后端公式复核（等额本息按标准年金公式，等额本金按首月还款展示）
3. 在下方分期列表点击「**新建分期**」，填写名称（如「车贷-比亚迪汉」）、分期类型（车贷/房贷/电子产品/其他）、起始月份、关联的分类与支付方式后保存
4. 点击「**本月自动入账**」：系统会把当月所有进行中分期的应还款**自动写入一笔支出交易**（日期固定为当月 15 号，重复点击幂等不会重复入账）

**固定支出**：

1. 维护每月固定开销清单（如网费、水费、电费、物业费）
2. 每项含名称、每月金额、支出分类、支付方式、图标、**启用开关**、**生效起始月份**
3. 停用某项后不再计入预算；生效起始月份之前的历史月份也不计入

**购物计划**：

1. 登记下月计划购买的物品：名称、预计花费、**优先级**（高/中/低）、**计划月份**
2. 计划会自动纳入对应月份的「预计支出」
3. 购买后点击「**标记已购**」，系统回填实际花费（默认取预计花费）与购买日期

### 预算对比报表

进入「**预算报表**」页面，顶部切换月度 / 年度视图：

**预计支出 = 固定支出（启用且当月生效）+ 分期（进行中且在还款周期内）+ 购物计划（当月未取消）**
**实际支出 = 当月已记录的支出交易按分类聚合**

- 三张摘要卡：预计 / 实际 / 差额（正数=超支红色，负数=节省绿色）
- 可视化柱状图：预计 vs 实际并列对比
- 逐项明细：预计项列表 + 实际支出按分类聚合列表

### 账单总览

进入「**账单总览**」页面，选择某个月份，查看该月的综合账单：

- 顶部三张卡：预计账单总额 / 实际账单总额 / 差额
- 逐项对比表：以「分类」为键对齐预计与实际，每行显示项目名、预计金额、实际金额、差额，**按差异绝对值从大到小排序**，一眼看出哪一项超预算最多
