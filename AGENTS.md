# Money_Book — 个人记账应用

> 本文件由 WorkBuddy 记忆系统导出，供 Codex CLI 读取。放到 Money_Book 项目根目录命名为 `AGENTS.md`。

## 项目身份

- **项目名**: Money_Book
- **物理路径**: `/Volumes/project`（SMB 挂载 Debian 服务器 `/www/wwwroot/money_book/src`）
- **GitHub 仓库**: https://github.com/kennyzhg/Money_Book（公开，账号 kennyzhg）
- **旧 git 路径**: `/Users/kenny/Documents/代码/Money_Book`（完整 git 仓库，推送入口）
- **桌面副本**: `/Users/kenny/Desktop/Money_Book/`（不含 db/node_modules）
- **类型**: 单端口部署的个人记账应用（前后端分离架构）

## 技术栈

- 前端: React 18 + Vite 6 + TailwindCSS 3 + Recharts + Zustand + React Router 7 + lucide-react 0.511.0
- 后端: Express 4 + tsx + better-sqlite3（SQLite 单文件，WAL 模式）
- 入口: `api/server.ts`（生产模式下同端口托管 `dist/` 静态资源与 `/api/v1`）
- 数据库: `data/money.db`
- 默认端口: 3001（可用 `PORT` 环境变量覆盖）

## 生产部署

- 生产环境: 内网 `10.10.10.6` / Debian 13 / 端口 `5391`
- 部署目录: `/opt/money-tracker`
- systemd 服务名: `money-tracker`
- 部署脚本: `deploy-linux.sh`（447 行）
- 数据库热备份: `cp data/money.db data/money-backup-$(date +%Y%m%d-%H%M%S).db`

## 约定

- 会话中称此项目为「Money_Book」而非「project」
- 中国财务惯例：收入绿、支出红（与 A 股涨红跌绿相反，README 已明确）
- **data/ 目录规则（用户强调）**：目录本身推送 GitHub，但 `data/*.db`、`data/*.db-shm`、`data/*.db-wal`、`data/*.sqlite*` 数据库文件**绝对不推送**
- GitHub 推送流程：`/Volumes/project` 改代码 → `cp` 到旧路径 → 旧路径 `git add/commit/push`
- rsync 时必须 `--exclude '.gitignore'` + `--exclude 'data/'` + `--exclude '._*'` + `git config core.fileMode false`
- 旧路径 vite.config.ts 有 `host: true`（局域网访问），勿误删

## 认证系统

- 单账号登录（session 落库 SHA-256 哈希，非 JWT）
- Cookie: httpOnly + sameSite=strict + secure（HTTPS 时）
- 会话有效期: 滑动 20 分钟（剩余 < TTL/2 时续期，避免每请求都写库）
- Agent 长期 API Token: `AGENT_API_TOKEN` 环境变量，`crypto.timingSafeEqual` 恒定时间比较
- 鉴权链: 先试 `Authorization: Bearer <token>`（Agent），失败再试 Cookie session（Web UI）
- 不用 cookie-parser（手写 5 行 getCookie 绕过）
- 不依赖 JWT（单账号场景 session 落库可即时吊销，重启即失效）

## UI 图标体系

- `src/lib/icons.tsx`: 60+ 图标按 11 个语义分组（收入/餐饮/交通/购物/居家/娱乐/医疗/教育/旅行/家庭/其他）
- `src/components/BrandLogo.tsx`: SVG「账本 + ¥」品牌徽标（圆角方形 + 蓝色渐变）
- `public/favicon.svg`: 渐变蓝 + ¥ 货币符号 + 账本脊线
- lucide-react 0.511.0 注意：没有 `Taxi`，用 `CarTaxiFront` 替代
- 默认图标约定：银行卡/花呗 → `landmark`，支付宝/微信/抖音月付 → `wallet`

## 后端代码质量

- `api/utils/errors.ts`: `ValidationError` / `NotFoundError`
- `api/utils/math.ts`: `round2` 工具函数
- `src/lib/useDeleteTransaction.ts`: 删除交易 Hook
- 各 controller/service/repository（transaction/config/statistics）已重构

## 任务历史

### 2026-07-23 — 工作空间命名 + 旧会话迁移 + 账单增强
- 工作空间命名为「Money_Book」（会话层面，不动文件系统）
- 旧 Money_Book 会话记忆迁移（4 个旧会话 jsonl + 2 个日志文件汇总）
- **账单功能增强**（8 个文件，类型检查 + vite build 通过）：
  - 年份选择器 + 月份可选（新增"全年"选项）+ 分页（>40 条触发，每页 40 条）
  - 后端向后兼容：不带 page/pageSize 时仍返回 Transaction[] 数组
  - `shared/types.ts` 新增 PaginatedTransactions 类型
  - `src/components/Pagination.tsx` 新文件
  - 前端默认显示当前年全部账单（month = ""）
- GitHub MCP 连接器目前是只读权限（push_files/create_or_update_file 均 403）

### 2026-07-24 — 财务规划五大模块 + 账号系统设计 + 单账号登录实施
- **财务规划五大模块**（前后端全链路，TypeScript 2302 模块 0 错误）：
  - 分期 `/api/v1/installments`（含 `/calc` 试算 + `/post-monthly` 自动入账，等额本息/等额本金）
  - 固定支出 `/api/v1/fixed-expenses`（enabled 字段 + startMonth）
  - 购物计划 `/api/v1/shopping-plans`（含 `PATCH /:id/purchase`）
  - 预算报表 `/api/v1/bills`（`/budget-monthly` `/budget-yearly` `/overview`）
  - 分期自动入账用 note 内嵌 `[installment:<id>:<month>]` 标签幂等去重，日期固定当月 15 号
  - Commit `217d699` 推送成功（33 个文件）
- **账号系统设计**：完整设计文档 `docs/ACCOUNT_SYSTEM_DESIGN.md`
  - 数据隔离选逻辑隔离（行级 user_id），非物理隔离
  - OAuth 默认不实现
  - 实施优先级：P0（反代+SSL+helmet+限速+修分页注入）→ P1 → P2 → P3
- **单账号登录实施**：
  - `api/data/authDb.ts` — sessions 表 + createSession/verifySession/destroySession
  - `api/middleware/auth.ts` — authenticate 中间件 + 手写 Cookie 解析
  - `api/routes/auth.ts` — POST /login /logout, GET /check
  - `src/pages/Login.tsx` + `src/lib/auth.ts`（useAuthStore）
  - `api/repositories/transactionRepository.ts` — 分页 LIMIT/OFFSET 改命名参数（消除 SQL 注入）
  - 单元测试 4 项全通过
  - Commit `aaa55e6` 推送成功
- **gen-password 脚本 Bug 修复**（3 次迭代）：
  - readline.createInstance 不存在 → 最终用 `fs.readSync(fd=0)` 同步按字节读取
  - TTY 分支 raw mode + 退格支持，非 TTY 分支同步读取，兼容管道/CI/docker
- **会话有效期改为滑动 20 分钟 + Agent 长期 Token**：
  - `SESSION_TTL_DAYS` → `SESSION_TTL_MINUTES`（默认 20）
  - `verifySession()` 返回 `{ valid, renewed?, newExpiresAt? }`
  - 续期阈值 TTL/2（剩余 10 分钟以上不写库）
  - `verifyAgentToken(token)` 恒定时间比较
- **全部账单新增分类筛选**：Commit `1141767` 推送成功

### 2026-07-25 — 金额输入框修复 + 月度趋势图重构
- **修复「记一笔」金额输入框无法输入小数点**：
  - 根因：number 存储 + String 回写丢失中间态（`12.` → `12`, `0.50` → `0.5`）
  - 修复：独立字符串 state `amountText` 管理显示值，提交时转 number
  - 经验：金额/数字输入框是 React 受控组件经典陷阱，应用字符串 state 管理显示值
  - Commit `4c31e88` 推送成功
- **月度收支趋势图重构**：
  - 第一版：ComposedChart 柱+线混搭 → emerald/rose 渐变 + 结余逐段着色 + 0 基准线
  - 第二版（用户要求大改）：纯 AreaChart 三折线（收入/支出/结余统一风格）
  - 结余 clamp 到非负（`Math.max(0, rawBalance)`），Y 轴 `domain={[0, 'auto']}`
  - Tooltip 展示 rawBalance 真实值，亏空时加注说明
  - emerald-600 / rose-600 / indigo-600 三色 + 渐变填充
  - Commit `c512032` 推送成功
  - Recharts 技术点：Line children 用 `<Cell>` 可分段着色；Area = 折线 + 下方填充

### 2026-07-26 — 仪表盘年度统计修复 + 备注筛选
- `/statistics/overview` 强制接收 `year=YYYY`，仅聚合该自然年交易（不再跨年混入）
- 新增 `/statistics/years`，仅返回 2024 年起存在交易的年份，数据驱动年份切换
- 月度和年度筛选器统一左右箭头 + 居中只读标签样式
- 全部账单新增备注关键字筛选（桌面筛选栏 + 移动端筛选抽屉）
- 后端安全转义 SQLite LIKE 通配符后执行备注包含匹配
- 分页接口新增按完整筛选结果计算的收入/支出/结余汇总（不再仅汇总当前页）

## GitHub 提交历史

| Commit | 描述 |
|--------|------|
| `c512032` | feat(仪表盘): 重构月度收支趋势图为三折线版本 |
| `4c31e88` | fix(记一笔): 修复金额输入框无法输入小数点 |
| `1141767` | feat(全部账单): 新增分类筛选项并联动收入支出金额汇总 |
| `aaa55e6` | feat(auth): 添加单账号登录会话系统 + 数据库备份恢复脚本 |
| `217d699` | feat: 新增财务规划五大模块 |
| `a296c2c` | feat(transactions): 支持年份选择器 + 月份可选 + 分页 |
| `2fb3de2` | docs: 在README中添加AI Agent对接指南 |
| `8c4d12b` | chore: 更新.gitignore，排除.workbuddy目录 |
| `a3c4472` | Initial commit |

## 常见故障排查

- 后端启动 500 + better-sqlite3 报 NODE_MODULE_VERSION 不匹配 → `npm rebuild better-sqlite3`
- 前端 JS 文件名带 hash（如 `index-BOPIsXXz.js`），部署时必须清理旧 assets
- `/Volumes/project` 是 SMB 挂载卷：npm install 会触发 safe-delete 失败
  - 正确部署流程：SSH 到服务器 `rm -rf node_modules && npm install && npm run build && systemctl restart money-tracker`
- node_modules/.bin/tsc 和 .bin/vite wrapper 被破坏 → 用 `node node_modules/typescript/bin/tsc -b` 直接调用
- SQLite WAL 锁文件残留导致 SQLITE_BUSY → 删 money.db-wal/shm
- 跨平台 node_modules 冲突（macOS arm64 vs Debian x86_64）

## 备份位置

- `~/Desktop/Money_Book_Backup_20260721_235624/`：项目重置前完整快照（168 条交易 / 21 分类 / 6 支付方式），含 RESTORE_INSTRUCTIONS.txt
