# OpenClaw / AI Agent 接入教程 · Money Tracker API

> 面向 AI Agent（OpenClaw、Claude、ChatGPT、Dify、Coze 等任何支持 HTTP 调用的工具）的个人记账 API 实操指南。
>
> 本文档所有示例 URL 中的 `<SERVER_HOST>` 和 `<SERVER_PORT>` 是占位符，请按你的部署情况替换：
>
> | 场景 | `<SERVER_HOST>` | `<SERVER_PORT>` |
> |---|---|---|
> | 本地开发（分开端口） | `localhost` | `3001`（API） |
> | 本地开发（前端代理） | `localhost` | `5173`（前端 → 自动转发到 API） |
> | 生产部署 | 你的服务器 IP 或域名 | 你设置的端口（默认 `3001`） |
>
> **示例**：`http://<SERVER_HOST>:<SERVER_PORT>/api/v1/config` → `http://money.example.com:8080/api/v1/config`

---

## 一、服务信息

| 项 | 值 |
|---|---|
| **API 基础路径** | `http://<SERVER_HOST>:<SERVER_PORT>/api/v1` |
| **健康检查** | `http://<SERVER_HOST>:<SERVER_PORT>/api/health` |
| **Web UI**（人类访问） | `http://<SERVER_HOST>:<SERVER_PORT>/` |
| **数据格式** | JSON（`Content-Type: application/json`） |
| **字符编码** | UTF-8 |
| **鉴权** | 无（内网/本地部署，零鉴权） |
| **调用方式** | HTTP（明文，适合内网/可信网络；公网请加 HTTPS 反代） |

> ⚠️ 部署时请确认端口已在防火墙放行；Agent 所在机器需能访问 `<SERVER_HOST>`。
> 公网部署强烈建议通过 Nginx 加 HTTPS（详见 `README.md` 的 Nginx 反代章节）。

---

## 二、快速验证（30 秒上手）

执行以下命令，若返回 `{"success":true,...}` 即说明服务正常。

### macOS / Linux（bash + curl）

```bash
# 替换为你的实际地址
export API_BASE="http://<SERVER_HOST>:<SERVER_PORT>"

# 健康检查
curl $API_BASE/api/health

# 获取所有可用分类与支付方式
curl $API_BASE/api/v1/config

# 查询 2026-07 月的所有交易
curl "$API_BASE/api/v1/transactions?month=2026-07"

# 查询本月统计
curl "$API_BASE/api/v1/statistics/monthly?month=2026-07"
```

### Windows（PowerShell）

```powershell
$API_BASE = "http://<SERVER_HOST>:<SERVER_PORT>"

Invoke-RestMethod "$API_BASE/api/health"
Invoke-RestMethod "$API_BASE/api/v1/config"
Invoke-RestMethod "$API_BASE/api/v1/statistics/monthly?month=2026-07"
```

### Python

```python
import requests

API_BASE = "http://<SERVER_HOST>:<SERVER_PORT>"

print(requests.get(f"{API_BASE}/api/health").json())
print(requests.get(f"{API_BASE}/api/v1/config").json())
```

---

## 三、OpenClaw 接入方式（三种任选）

### 方式 A：自定义工具（Function Calling / Tool Use）

在 OpenClaw 的工具配置中，为每个端点注册一个工具。以下是推荐的工具定义（JSON Schema 格式，可直接粘贴到 OpenClaw 的 tools 配置中）：

```json
[
  {
    "name": "money_get_config",
    "description": "获取所有可用的账单分类（收入/支出）和支付方式。调用写接口前必须先调用此工具拿到白名单。",
    "parameters": { "type": "object", "properties": {} }
  },
  {
    "name": "money_list_transactions",
    "description": "查询交易列表，支持按月份/类型/支付方式/分类筛选。结果按日期倒序。",
    "parameters": {
      "type": "object",
      "properties": {
        "month": { "type": "string", "pattern": "^\\d{4}-\\d{2}$", "description": "YYYY-MM，例如 2026-07" },
        "type": { "type": "string", "enum": ["income", "expense"] },
        "paymentMethod": { "type": "string", "description": "如 银行卡/支付宝/微信/抖音月付/花呗（必须来自 config）" },
        "category": { "type": "string", "description": "如 餐饮/交通/工资（必须来自 config）" }
      }
    }
  },
  {
    "name": "money_create_transaction",
    "description": "新建一笔交易（记账）。category 与 paymentMethod 必须来自 money_get_config 的返回值。",
    "parameters": {
      "type": "object",
      "required": ["date", "amount", "type", "category", "paymentMethod"],
      "properties": {
        "date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$", "description": "YYYY-MM-DD" },
        "amount": { "type": "number", "exclusiveMinimum": 0, "description": "金额，正数" },
        "type": { "type": "string", "enum": ["income", "expense"] },
        "category": { "type": "string" },
        "paymentMethod": { "type": "string" },
        "note": { "type": "string", "description": "可选备注" }
      }
    }
  },
  {
    "name": "money_update_transaction",
    "description": "更新一笔交易，只需传要修改的字段。",
    "parameters": {
      "type": "object",
      "required": ["id"],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "date": { "type": "string" },
        "amount": { "type": "number" },
        "type": { "type": "string", "enum": ["income", "expense"] },
        "category": { "type": "string" },
        "paymentMethod": { "type": "string" },
        "note": { "type": "string" }
      }
    }
  },
  {
    "name": "money_delete_transaction",
    "description": "删除一笔交易（按 id）。",
    "parameters": {
      "type": "object",
      "required": ["id"],
      "properties": { "id": { "type": "string", "format": "uuid" } }
    }
  },
  {
    "name": "money_monthly_statistics",
    "description": "获取指定月份的收入/支出汇总、分类与支付方式聚合（用于仪表盘）。",
    "parameters": {
      "type": "object",
      "required": ["month"],
      "properties": { "month": { "type": "string", "pattern": "^\\d{4}-\\d{2}$" } }
    }
  },
  {
    "name": "money_year_overview",
    "description": "获取全年各月收支概览，用于趋势分析。",
    "parameters": { "type": "object", "properties": {} }
  }
]
```

每个工具内部对应一次 HTTP 调用（替换占位符为你的实际地址）：

| 工具名 | HTTP 方法 + 路径 |
|---|---|
| `money_get_config` | `GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/config` |
| `money_list_transactions` | `GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions` |
| `money_create_transaction` | `POST http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions` |
| `money_update_transaction` | `PUT http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions/{id}` |
| `money_delete_transaction` | `DELETE http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions/{id}` |
| `money_monthly_statistics` | `GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/statistics/monthly?month={month}` |
| `money_year_overview` | `GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/statistics/overview` |

### 方式 B：System Prompt + 自由 HTTP

如果 OpenClaw 不支持结构化工具定义，可以直接在系统提示词里告诉模型如何调用 API：

```text
你可以通过 HTTP 调用一个记账 API 来帮助用户管理日常收支。

【服务地址】
基础路径：http://<SERVER_HOST>:<SERVER_PORT>/api/v1
健康检查：http://<SERVER_HOST>:<SERVER_PORT>/api/health

【统一响应格式】
所有接口返回 { "success": boolean, "data": any|null, "message": string }
若 success=false，向用户展示 message。

【可用接口】
1. GET  /api/v1/config                              # 获取分类与支付方式白名单
2. GET  /api/v1/transactions?month=YYYY-MM&type=... # 查询交易
3. POST /api/v1/transactions                        # 新建（body: {date,amount,type,category,paymentMethod,note}）
4. PUT  /api/v1/transactions/:id                    # 更新（body 为部分字段）
5. DELETE /api/v1/transactions/:id                  # 删除
6. GET  /api/v1/statistics/monthly?month=YYYY-MM    # 月度统计
7. GET  /api/v1/statistics/overview                 # 全年概览

【调用规则】
1. 每次记账/修改前，必须先 GET /api/v1/config，确保 category 和 paymentMethod 在白名单中。
2. 中文查询参数需做 URL 编码（如 paymentMethod=微信 → %E5%BE%AE%E4%BF%A1）。
3. amount 必须是正数；type 只能是 income 或 expense。
4. 日期格式：date=YYYY-MM-DD，month=YYYY-MM。
5. 不要伪造 id；只能通过查询接口获得真实 id 后再修改/删除。

【典型对话】
用户："我刚才吃火锅花了 188，支付宝付的"
你的动作：
  1. GET /api/v1/config
  2. POST /api/v1/transactions  body: {date:"今天", amount:188, type:"expense", category:"餐饮", paymentMethod:"支付宝", note:"火锅"}
  3. 回复："已记录，2026-07 月已支出 XXX 元"
```

### 方式 C：OpenAPI 规范文件

如果 OpenClaw / 其他工具支持导入 OpenAPI（Swagger），可把下面的 spec 保存为 `money-tracker-openapi.json` 并导入（注意替换 `servers[0].url`）：

```json
{
  "openapi": "3.1.0",
  "info": { "title": "Money Tracker API", "version": "1.0.0" },
  "servers": [{ "url": "http://<SERVER_HOST>:<SERVER_PORT>/api/v1" }],
  "paths": {
    "/config": { "get": { "summary": "获取配置", "operationId": "getConfig" } },
    "/transactions": {
      "get": { "summary": "查询交易", "operationId": "listTransactions",
               "parameters": [
                 { "name": "month", "in": "query", "schema": { "type": "string" } },
                 { "name": "type", "in": "query", "schema": { "type": "string", "enum": ["income","expense"] } },
                 { "name": "paymentMethod", "in": "query", "schema": { "type": "string" } },
                 { "name": "category", "in": "query", "schema": { "type": "string" } }
               ] },
      "post": { "summary": "新建交易", "operationId": "createTransaction" }
    },
    "/transactions/{id}": {
      "get":    { "summary": "获取详情", "operationId": "getTransaction" },
      "put":    { "summary": "更新", "operationId": "updateTransaction" },
      "delete": { "summary": "删除", "operationId": "deleteTransaction" }
    },
    "/statistics/monthly":  { "get": { "summary": "月度统计", "operationId": "monthlyStats" } },
    "/statistics/overview": { "get": { "summary": "全年概览", "operationId": "yearOverview" } }
  }
}
```

---

## 四、接口详解

### 4.1 统一响应格式

```json
{ "success": true, "data": { }, "message": "ok" }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `success` | boolean | 请求是否成功 |
| `data` | T \| null | 业务数据；失败时为 `null` |
| `message` | string | 状态说明；失败时为错误描述 |

### 4.2 配置接口

`GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/config`

```bash
curl http://<SERVER_HOST>:<SERVER_PORT>/api/v1/config
```

响应（节选）：

```json
{
  "success": true,
  "data": {
    "categories": {
      "income":  [{ "name": "工资", "icon": "wallet" }, ...],
      "expense": [{ "name": "餐饮", "icon": "utensils" }, ...]
    },
    "paymentMethods": [{ "name": "支付宝", "icon": "wallet" }, ...]
  }
}
```

> 💡 Agent 应**缓存此响应**（TTL 建议 1 小时），避免每次记账都拉取。
> 用户可在 Web 管理后台修改分类与支付方式，因此配置**不是固定值**，必须以接口返回为准。

### 4.3 查询交易列表

`GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions`

| 参数 | 类型 | 说明 |
|---|---|---|
| `month` | `YYYY-MM` | 月份过滤 |
| `type` | `income`/`expense` | 类型过滤 |
| `paymentMethod` | string | 支付方式（URL 编码） |
| `category` | string | 分类（URL 编码） |

```bash
# 查询 2026-07 月的所有微信支出
curl -s -G "http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions" \
  --data-urlencode "month=2026-07" \
  --data-urlencode "type=expense" \
  --data-urlencode "paymentMethod=微信"
```

返回 `Transaction[]`，按 `date` 倒序。

### 4.4 新建交易

`POST http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions`

```bash
curl -s -X POST "http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-07-20",
    "amount": 188,
    "type": "expense",
    "category": "餐饮",
    "paymentMethod": "支付宝",
    "note": "火锅"
  }'
```

**校验规则**：

| 字段 | 必填 | 规则 |
|---|---|---|
| `date` | ✅ | `YYYY-MM-DD` |
| `amount` | ✅ | 数字，> 0 |
| `type` | ✅ | `income` 或 `expense` |
| `category` | ✅ | 必须在 `config.categories[type]` |
| `paymentMethod` | ✅ | 必须在 `config.paymentMethods` |
| `note` | ❌ | 任意字符串 |

成功返回 `201 Created`，`data` 为完整记录（含 `id`）。

### 4.5 更新交易

`PUT http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions/{id}`

```bash
curl -s -X PUT "http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions/abc-123" \
  -H "Content-Type: application/json" \
  -d '{ "note": "其实是 200 块" }'
```

请求体只需传要修改的字段（`Partial<Transaction>`）。

### 4.6 删除交易

`DELETE http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions/{id}`

```bash
curl -s -X DELETE "http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions/abc-123"
```

返回 `{ "success": true, "data": null, "message": "删除成功" }`。

### 4.7 月度统计

`GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/statistics/monthly?month=2026-07`

```bash
curl "http://<SERVER_HOST>:<SERVER_PORT>/api/v1/statistics/monthly?month=2026-07"
```

```json
{
  "success": true,
  "data": {
    "month": "2026-07",
    "totalIncome": 13700,
    "totalExpense": 3866.6,
    "balance": 9833.4,
    "expenseByCategory": [
      { "name": "居住", "value": 2300, "icon": "home" },
      { "name": "餐饮", "value": 584.6, "icon": "utensils" }
    ],
    "expenseByPaymentMethod": [
      { "name": "银行卡", "value": 2300, "icon": "landmark" },
      { "name": "微信",   "value": 503.6, "icon": "wallet" }
    ]
  }
}
```

> `balance = totalIncome - totalExpense`；聚合仅含支出。

### 4.8 全年概览

`GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/statistics/overview`

```bash
curl http://<SERVER_HOST>:<SERVER_PORT>/api/v1/statistics/overview
```

```json
{
  "success": true,
  "data": {
    "months": [
      { "month": "2026-05", "income": 13800, "expense": 3801,  "balance": 9999 },
      { "month": "2026-06", "income": 12500, "expense": 5071,  "balance": 7429 },
      { "month": "2026-07", "income": 13700, "expense": 3866.6,"balance": 9833.4 }
    ],
    "yearIncome": 40000, "yearExpense": 12738.6, "yearBalance": 27261.4
  }
}
```

---

## 五、典型对话场景（Agent 实战）

> 以下流程中 `<SERVER_HOST>:<SERVER_PORT>` 由 Agent 框架自动替换为实际部署地址。

### 场景 1：记账

**用户**："我刚才吃火锅花了 188，支付宝付的"

**Agent 动作**：
```
1. GET  http://<SERVER_HOST>:<SERVER_PORT>/api/v1/config
   → 确认 "餐饮" 和 "支付宝" 在白名单
2. POST http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions
   body: { date:"2026-07-19", amount:188, type:"expense",
           category:"餐饮", paymentMethod:"支付宝", note:"火锅" }
3. 回复："已记账 188 元（餐饮/支付宝）。本月已支出 4054.6 元。"
```

### 场景 2：查询本月

**用户**："这个月花了多少？"

**Agent 动作**：
```
1. GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/statistics/monthly?month=2026-07
2. 回复："2026-07 月已支出 3866.6 元，最大类目是 居住（2300 元），
        主要通过 银行卡（2300 元）支付。"
```

### 场景 3：删除某笔

**用户**："把昨天那笔 66.6 的删了"

**Agent 动作**：
```
1. GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions?month=2026-07
2. 在结果中匹配 amount ≈ 66.6，拿到 id
3. DELETE http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions/{id}
4. 回复："已删除该笔 66.6 元记录。"
```

### 场景 4：趋势分析

**用户**："最近半年收支怎么样？"

**Agent 动作**：
```
1. GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/statistics/overview
2. 汇总 months 数组，输出：
   "最近 3 个月：5 月结余 9999，6 月结余 7429，7 月结余 9833.4，
    整体储蓄率 68%。"
```

### 场景 5：批量记账

**用户**："今天午饭 25、地铁 4 块、咖啡 28，都是微信"

**Agent 动作**：
```
1. GET http://<SERVER_HOST>:<SERVER_PORT>/api/v1/config
2. 并行 POST 3 次：
   - { amount:25, category:"餐饮",   paymentMethod:"微信", note:"午饭" }
   - { amount:4,  category:"交通",   paymentMethod:"微信", note:"地铁" }
   - { amount:28, category:"餐饮",   paymentMethod:"微信", note:"咖啡" }
3. 汇总："已记录 3 笔，合计 57 元。"
```

---

## 六、最佳实践

### 1. 缓存 config 响应

`/api/v1/config` 内容极少变化，Agent 应在会话级别缓存，避免每次记账都多一次请求。

### 2. 中文参数 URL 编码

查询参数含中文时必须 URL 编码：

```bash
# ❌ 错误（可能乱码）
curl "http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions?paymentMethod=微信"

# ✅ 正确
curl -G "http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions" \
  --data-urlencode "paymentMethod=微信"
```

JavaScript / Python 示例：

```javascript
// JS（fetch）
const url = new URL("http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions");
url.searchParams.set("paymentMethod", "微信");
await fetch(url);
```

```python
# Python（requests 自动编码）
import requests
requests.get("http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions",
             params={"paymentMethod": "微信"})
```

### 3. 时间处理

- `date`：用户当前日期（Agent 应使用服务器所在时区，本服务默认为 `Asia/Shanghai`）
- `month`：由 `date` 截取 `YYYY-MM`

获取当前月份：

```python
from datetime import datetime
month = datetime.now().strftime("%Y-%m")  # 如 2026-07
```

### 4. 错误处理

| HTTP 状态 | 触发场景 | 处理建议 |
|---|---|---|
| 400 | 参数校验失败 | 向用户展示 `message`，询问如何修正 |
| 400 | category/paymentMethod 不合法 | 重新 GET `/config` 拉最新白名单 |
| 404 | 资源不存在 | 提示用户记录可能已被删除 |
| 500 | 服务器内部错误 | 提示稍后重试，并检查服务状态 |
| 网络错误 | 服务不可达 | 先调 `/api/health` 确认服务在线 |

### 5. 幂等性

- `GET` / `DELETE` 天然幂等
- `POST` 不幂等，避免重复调用同一笔交易
- `PUT` 幂等，可安全重试

如需防止重复记账，可在 `note` 中加业务标识（如订单号）。

---

## 七、故障排查

### Q1：Agent 调用报 `ECONNREFUSED` 或超时

按顺序排查：

```bash
# 1. 从 Agent 所在机器测试连通性
curl http://<SERVER_HOST>:<SERVER_PORT>/api/health

# 2. 若不通，确认服务在运行
# Linux (systemd)
sudo systemctl status money-tracker
# macOS (brew/homebrew-services 或 launchd)
ps aux | grep -E "node.*server|tsx.*server" | grep -v grep

# 3. 检查端口是否监听
# Linux/macOS
lsof -nP -iTCP:<SERVER_PORT> -sTCP:LISTEN
# 或
ss -lntp | grep <SERVER_PORT>
```

**Linux 防火墙**（按发行版二选一）：

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow <SERVER_PORT>/tcp

# CentOS/RHEL/Fedora (firewalld)
sudo firewall-cmd --permanent --add-port=<SERVER_PORT>/tcp
sudo firewall-cmd --reload
```

**Windows 防火墙**：

```powershell
New-NetFirewallRule -DisplayName "Money Tracker" -Direction Inbound -Protocol TCP -LocalPort <SERVER_PORT> -Action Allow
```

### Q2：返回 `category 不合法：未知分类`

说明 Agent 提交的 category 不在白名单。处理：

```bash
# 拉最新 config
curl http://<SERVER_HOST>:<SERVER_PORT>/api/v1/config
# 在返回的 categories[type] 中选择正确值
```

如需新增自定义分类，请通过 Web 管理页 `http://<SERVER_HOST>:<SERVER_PORT>/admin` 操作（详见 `README.md` 的「管理分类」章节）。

### Q3：返回 500 错误

查看服务日志：

```bash
# Linux (systemd)
sudo journalctl -u money-tracker -n 100 --no-pager
sudo journalctl -u money-tracker -f                # 实时跟踪

# 或直接在项目目录查看 stdout（前台运行时）
cd /opt/money-tracker && npm start                 # 临时前台运行复现问题
```

重启服务：

```bash
# Linux
sudo systemctl restart money-tracker

# macOS / 无 systemd 的 Linux
cd /opt/money-tracker
pkill -f "tsx api/server"
nohup npm start > logs/run.log 2>&1 &
```

### Q4：重启服务后数据是否丢失

**不会丢失**。当前使用 SQLite 持久化存储，数据保存在服务端的 `data/money.db` 文件中。服务重启、机器重启、甚至重新部署（只要不删 `data/` 目录），数据都会保留。

备份命令（运行中也可执行，WAL 模式支持热备份）：

```bash
# Linux / macOS
cp data/money.db "data/money-backup-$(date +%Y%m%d-%H%M%S).db"

# Windows (PowerShell)
Copy-Item "data\money.db" "data\money-backup-$(Get-Date -Format yyyyMMdd-HHmmss).db"
```

---

## 八、附录

### 完整端点速查表

| 方法 | URL | 用途 |
|---|---|---|
| GET | `http://<SERVER_HOST>:<SERVER_PORT>/api/health` | 健康检查 |
| GET | `http://<SERVER_HOST>:<SERVER_PORT>/api/v1/config` | 获取配置 |
| GET | `http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions` | 查询交易 |
| POST | `http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions` | 新建交易 |
| GET | `http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions/{id}` | 获取详情 |
| PUT | `http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions/{id}` | 更新 |
| DELETE | `http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions/{id}` | 删除 |
| GET | `http://<SERVER_HOST>:<SERVER_PORT>/api/v1/statistics/monthly?month=YYYY-MM` | 月度统计 |
| GET | `http://<SERVER_HOST>:<SERVER_PORT>/api/v1/statistics/overview` | 全年概览 |

### 数据模型

```typescript
interface Transaction {
  id: string;             // UUID
  date: string;           // YYYY-MM-DD
  amount: number;         // 正数
  type: 'income' | 'expense';
  category: string;       // 来自 config
  paymentMethod: string;  // 来自 config
  note?: string;
  createdAt: string;      // ISO timestamp
  updatedAt: string;
}
```

### 相关文档

- 项目 README：仓库根目录 `README.md`（含部署、端口配置、使用说明）
- 原始 API 规范：仓库内 `openclaw_readme.md`
- 管理后台：`http://<SERVER_HOST>:<SERVER_PORT>/admin`（人类访问，新增分类/支付方式）
