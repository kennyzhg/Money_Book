# OpenClaw / AI Agent API 接入文档

个人记账应用为 AI Agent（如 OpenClaw、Claude、ChatGPT、Dify、Coze 等任何支持 HTTP 调用的工具）提供一套 **RESTful API**，用于读写用户的收支数据。

> **占位符约定**：本文档所有示例 URL 使用 `<SERVER_HOST>` 和 `<SERVER_PORT>` 占位符，请按你的部署情况替换：
> - **本地开发**：`<SERVER_HOST>` = `localhost`、`<SERVER_PORT>` = `3001`
> - **生产部署**：`<SERVER_HOST>` = 你的服务器 IP 或域名（如 `10.0.0.5`、`money.example.com`）、`<SERVER_PORT>` = 你设置的端口（默认 `3001`）
>
> 例如 `http://<SERVER_HOST>:<SERVER_PORT>/api/v1/config` → `http://10.0.0.5:3001/api/v1/config`

- **Base URL**：`http://<SERVER_HOST>:<SERVER_PORT>`
- **API 前缀**：`/api/v1`
- **数据格式**：所有请求体 / 响应体均为 JSON（`Content-Type: application/json`）
- **鉴权**：当前为本地/内网部署，**无需鉴权**
- **字符编码**：UTF-8；中文查询参数需做 URL 编码（如 `paymentMethod=微信` → `%E5%BE%AE%E4%BF%A1`）

---

## 1. 统一响应格式

所有接口返回稳定的 JSON 结构，便于 Agent 解析：

```json
{
  "success": true,
  "data": { },
  "message": "ok"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 请求是否成功 |
| `data` | T \| null | 业务数据；失败时为 `null` |
| `message` | string | 状态说明；失败时为错误描述 |

**失败示例**：

```json
{
  "success": false,
  "data": null,
  "message": "category 不合法：未知分类"
}
```

HTTP 状态码与 `success` 字段一致：成功为 200/201，失败为 400/404/500。

---

## 2. 接口清单

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/health` | 健康检查（Agent 启动时探测服务可用性） |
| GET | `/api/v1/config` | 获取所有可用分类、支付方式 |
| GET | `/api/v1/transactions` | 查询交易列表（支持筛选） |
| POST | `/api/v1/transactions` | 新建一笔交易 |
| GET | `/api/v1/transactions/:id` | 获取单条交易详情 |
| PUT | `/api/v1/transactions/:id` | 更新交易 |
| DELETE | `/api/v1/transactions/:id` | 删除交易 |
| GET | `/api/v1/statistics/monthly?month=YYYY-MM` | 指定月份的统计聚合 |
| GET | `/api/v1/statistics/overview` | 全年各月收支概览 |

---

## 3. 配置接口

### `GET /api/v1/config`

**用途**：获取所有可用分类与支付方式。**所有下拉选项都应来自此接口**，Agent 调用 `POST/PUT` 时传的 `category`、`paymentMethod` 必须从这里取值。

**请求示例**：

```bash
curl http://<SERVER_HOST>:<SERVER_PORT>/api/v1/config
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "categories": {
      "income": [
        { "name": "工资", "icon": "wallet" },
        { "name": "兼职", "icon": "briefcase" },
        { "name": "奖金", "icon": "gift" },
        { "name": "投资收益", "icon": "trending-up" }
      ],
      "expense": [
        { "name": "餐饮", "icon": "utensils" },
        { "name": "交通", "icon": "car" },
        { "name": "购物", "icon": "shopping-bag" },
        { "name": "娱乐", "icon": "gamepad-2" },
        { "name": "居住", "icon": "home" },
        { "name": "医疗", "icon": "heart-pulse" },
        { "name": "教育", "icon": "graduation-cap" }
      ]
    },
    "paymentMethods": [
      { "name": "银行卡", "icon": "landmark" },
      { "name": "支付宝", "icon": "wallet" },
      { "name": "微信",   "icon": "wallet" },
      { "name": "抖音月付", "icon": "wallet" },
      { "name": "花呗",   "icon": "landmark" }
    ]
  },
  "message": "ok"
}
```

> **Agent 提示**：
> - `icon` 字段对应 [lucide.dev](https://lucide.dev) 图标名（kebab-case），可用于自描述渲染。
> - Agent 应**缓存此响应**（TTL 建议 1 小时），避免每次记账都拉取。
> - `categories` / `paymentMethods` 的内容**可由用户在 Web 管理后台修改**，因此务必以实际返回值为准，不要硬编码。

---

## 4. 交易 CRUD

### 数据模型

```typescript
interface Transaction {
  id: string;             // UUID
  date: string;           // YYYY-MM-DD
  amount: number;         // 正数，最多 2 位小数
  type: 'income' | 'expense';
  category: string;       // 必须来自 config.categories[type]
  paymentMethod: string;  // 必须来自 config.paymentMethods
  note?: string;          // 可选备注
  createdAt: string;      // ISO 时间戳
  updatedAt: string;      // ISO 时间戳
}
```

### 4.1 查询列表

`GET /api/v1/transactions`

**Query 参数**（全部可选）：

| 参数 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `month` | string | `2026-07` | 月份过滤，格式 `YYYY-MM` |
| `type` | enum | `expense` / `income` | 类型过滤 |
| `paymentMethod` | string | `微信` | 支付方式过滤（需 URL 编码） |
| `category` | string | `餐饮` | 分类过滤（需 URL 编码） |

**示例**：

```bash
# 查询 2026-07 月的所有微信支出
curl -s -G "http://<SERVER_HOST>:<SERVER_PORT>/api/v1/transactions" \
  --data-urlencode "month=2026-07" \
  --data-urlencode "type=expense" \
  --data-urlencode "paymentMethod=微信"
```

**响应**：`data` 为 `Transaction[]`，按 `date` 倒序排列。

### 4.2 新建交易

`POST /api/v1/transactions`

**请求体**：

```json
{
  "date": "2026-07-20",
  "amount": 66.6,
  "type": "expense",
  "category": "餐饮",
  "paymentMethod": "微信",
  "note": "API 测试"
}
```

| 字段 | 必填 | 校验规则 |
|------|------|----------|
| `date` | 是 | `YYYY-MM-DD` 格式 |
| `amount` | 是 | 数字，> 0 |
| `type` | 是 | `income` 或 `expense` |
| `category` | 是 | 必须在 `config.categories[type]` 中 |
| `paymentMethod` | 是 | 必须在 `config.paymentMethods` 中 |
| `note` | 否 | 任意字符串 |

**响应**：`data` 为创建后的完整 `Transaction`（含 `id`、`createdAt`、`updatedAt`），HTTP 201。

### 4.3 获取详情

`GET /api/v1/transactions/:id`

**响应**：`data` 为 `Transaction`；不存在返回 404。

### 4.4 更新

`PUT /api/v1/transactions/:id`

**请求体**：`Partial<Transaction>`，只传需要修改的字段即可。校验规则同 POST。

**响应**：`data` 为更新后的完整记录。

### 4.5 删除

`DELETE /api/v1/transactions/:id`

**响应**：`data` 为 `null`，`message` 为 "删除成功"。

---

## 5. 统计接口

### 5.1 月度统计

`GET /api/v1/statistics/monthly?month=2026-07`

**用途**：获取指定月份的收入/支出汇总、分类与支付方式聚合。

**响应示例**：

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
      { "name": "餐饮", "value": 584.6, "icon": "utensils" },
      { "name": "购物", "value": 459, "icon": "shopping-bag" }
    ],
    "expenseByPaymentMethod": [
      { "name": "银行卡", "value": 2300, "icon": "landmark" },
      { "name": "花呗",   "value": 459,   "icon": "landmark" },
      { "name": "微信",   "value": 503.6, "icon": "wallet" }
    ]
  },
  "message": "ok"
}
```

> **说明**：`balance = totalIncome - totalExpense`；聚合仅统计支出（不含收入）。

### 5.2 全年概览

`GET /api/v1/statistics/overview`

**响应示例**：

```json
{
  "success": true,
  "data": {
    "months": [
      { "month": "2026-05", "income": 13800, "expense": 3801,  "balance": 9999 },
      { "month": "2026-06", "income": 12500, "expense": 5071,  "balance": 7429 },
      { "month": "2026-07", "income": 13700, "expense": 3866.6,"balance": 9833.4 }
    ],
    "yearIncome": 40000,
    "yearExpense": 12738.6,
    "yearBalance": 27261.4
  },
  "message": "ok"
}
```

> **说明**：`months` 按月份升序；仅返回已有数据的月份。

---

## 6. 错误处理

| HTTP 状态 | 触发场景 | 示例 `message` |
|-----------|----------|----------------|
| 400 | 参数校验失败 | `amount 必须大于 0` / `date 必须为 YYYY-MM-DD 格式` |
| 400 | `category` / `paymentMethod` 不在配置中 | `category 不合法：未知分类` |
| 404 | 资源不存在 | `交易不存在` / `API not found` |
| 500 | 服务器内部错误 | `服务器内部错误` |

Agent 应根据 `success: false` 判断失败，并通过 `message` 向用户反馈原因。

---

## 7. 推荐调用流程（Agent 实践）

### 流程 A：记账（用户说"我刚花了 30 块吃早餐，微信付的"）

```
1. GET  /api/v1/config                              # 拿到分类与支付方式白名单
2. POST /api/v1/transactions                        # body 见 4.2
   {
     "date": "2026-07-19", "amount": 30, "type": "expense",
     "category": "餐饮", "paymentMethod": "微信", "note": "早餐"
   }
```

### 流程 B：查询本月消费（用户说"这个月花了多少？"）

```
1. GET /api/v1/statistics/monthly?month=2026-07
2. 回复：totalExpense + 分类 Top 3
```

### 流程 C：删除某笔记录（用户说"把昨天那笔 66.6 的删了"）

```
1. GET  /api/v1/transactions?month=2026-07          # 在结果里匹配 amount ≈ 66.6
2. DELETE /api/v1/transactions/{id}
```

### 流程 D：趋势分析（用户说"最近半年收支怎么样？"）

```
1. GET /api/v1/statistics/overview
2. 汇总 months 数组，输出每月结余变化
```

---

## 8. 健康检查

`GET /api/health`

```bash
curl http://<SERVER_HOST>:<SERVER_PORT>/api/health
```

```json
{ "success": true, "message": "ok" }
```

可用于 Agent 启动时探测服务是否在线。

---

## 9. 在不同 Agent 工具中的接入方式

### 9.1 OpenClaw / 通用 Function Calling

将本文件第 3、4、5 节的每个端点注册为一个 Tool。详见仓库内 `openclaw_tutorial.md`（含完整 JSON Schema 工具定义、System Prompt 模板、OpenAPI spec）。

### 9.2 Dify / Coze / FastGPT 等 Low-Code 平台

把每个端点配置为「HTTP 请求」节点：
- **URL**：将本文件中的 `http://<SERVER_HOST>:<SERVER_PORT>/api/v1/...` 替换为你的实际地址
- **Method**：见第 2 节接口清单
- **Body / Query**：按第 4、5 节字段说明填写

### 9.3 LangChain / LlamaIndex

使用 `requests` / `httpx` 封装为 Python 工具：

```python
import requests

BASE = "http://<SERVER_HOST>:<SERVER_PORT>/api/v1"

def create_transaction(date, amount, type_, category, payment_method, note=""):
    return requests.post(f"{BASE}/transactions", json={
        "date": date, "amount": amount, "type": type_,
        "category": category, "paymentMethod": payment_method, "note": note
    }).json()
```

### 9.4 curl / Postman

直接复制本文件第 3、4、5 节的 `curl` 示例，替换占位符即可测试。

---

## 10. 部署与启动

详见仓库根目录 `README.md` 的「Linux 部署」章节。简要步骤：

```bash
# 安装依赖
npm install

# 开发模式（前端 5173、后端 3001，可同时访问）
npm run dev

# 生产模式（单端口，前端构建后由后端托管）
npm run build
npm start                          # 默认端口 3001
PORT=8080 npm start                # 修改端口
```

启动后：

- **开发模式**（前后端分离端口）：前端默认 `http://localhost:5173`（仅供人类查看），API 默认 `http://localhost:3001/api/v1`（**Agent 入口**）；端口可在 `vite.config.ts` 与环境变量 `PORT` 中修改，详见 `README.md` 的「端口配置」章节
- **生产模式**（单端口）：Web UI 与 API 同端口，`http://<SERVER_HOST>:<PORT>/` 为前端，`http://<SERVER_HOST>:<PORT>/api/v1` 为 API

---

## 11. 数据存储说明

- **持久化**：SQLite 单文件存储，路径 `data/money.db`，WAL 模式
- **进程重启数据不会丢失**
- **首次启动**自动建表并写入演示数据
- **备份**只需拷贝 `data/money.db` 文件（运行中也可热备）
- **重置**：停服后删除 `data/money.db*`，重启即重新建表并 seed
