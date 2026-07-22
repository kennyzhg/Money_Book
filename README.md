# Money Tracker · 个人记账应用

一个功能齐全的个人记账网页应用，前后端分离架构，单端口部署。记录日常收支、自定义分类与支付方式、生成可视化统计图表，并内置一套 **Agent-Friendly** 的 RESTful API。

---

## 目录

- [项目特性](#项目特性)
- [Linux 部署](#linux-部署)
  - [1. 安装 Node.js](#1-安装-nodejs)
  - [2. 部署项目](#2-部署项目)
  - [3. 使用 systemd 守护进程](#3-使用-systemd-守护进程)
  - [4. Nginx 反向代理（可选）](#4-nginx-反向代理可选)
  - [5. 防火墙](#5-防火墙)
  - [6. 升级与备份](#6-升级与备份)
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

---

## 项目特性

- **记账**：日期 / 金额 / 类型（收入、支出）/ 分类 / 支付方式 / 备注
- **账单列表**：按月份、类型、支付方式筛选，支持单条编辑、删除
- **批量导入**：CSV 模板填写后一键导入，错误跳过并详细反馈
- **仪表盘**：年度视图（月度趋势图 + 汇总表）+ 月度视图（摘要卡 + 分类/支付方式图表 + 当月明细）
- **管理后台**：可视化新增/删除分类（按收入/支出分组）、支付方式，内置图标选择器（按主题分组，支持搜索）
- **数据持久化**：SQLite 单文件存储（`data/money.db`），WAL 模式，零配置

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

# 构建前端到 dist/
npm run build

# （可选）删除开发依赖以减小体积
npm prune --omit=dev

# 启动（前台测试）
npm start
# → 输出 "Server ready on port 3001"
```

浏览器访问 `http://<服务器IP>:3001/`，即可看到前端页面；API 在 `http://<服务器IP>:3001/api/v1/`。

> **端口**：可通过环境变量 `PORT=80 npm start` 修改。

> **注意**：`npm prune --omit=dev` 后若需重新构建，必须再次执行 `npm install`。

### 3. 使用 systemd 守护进程

创建 `/etc/systemd/system/money-tracker.service`：

```ini
[Unit]
Description=Money Tracker App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/money-tracker
Environment=NODE_ENV=production
Environment=PORT=3001
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

### 4. Nginx 反向代理（可选）

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

### 5. 防火墙

```bash
# 仅暴露 80（若用 Nginx）
sudo ufw allow 80/tcp

# 或直接暴露 3001（不使用 Nginx）
sudo ufw allow 3001/tcp

# 启用防火墙（如尚未启用）
sudo ufw enable
```

> CentOS 默认使用 `firewalld`，命令为 `sudo firewall-cmd --permanent --add-port=3001/tcp && sudo firewall-cmd --reload`。

### 6. 升级与备份

**升级到新版本**：

```bash
cd /opt/money-tracker

# 1. 备份数据库（强烈建议）
sqlite3 data/money.db "VACUUM INTO 'data/money-backup-$(date +%Y%m%d).db'"

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

**数据库备份**：

> ⚠️ 本项目使用 SQLite WAL 模式，**不可直接用 `cp money.db` 备份**（WAL 中可能有未合并的写入）。
> 正确方法：用 `VACUUM INTO` 不停服生成完整个单文件快照。

**手动备份一次**：

```bash
sqlite3 /opt/money-tracker/data/money.db \
  "VACUUM INTO '/opt/money-tracker/data/money-$(date +%Y%m%d-%H%M%S).db'"
```

**每日自动备份（cron）**：

项目内置了备份脚本 `scripts/money_db_backup.sh`，部署到服务器后注册 cron 即可：

```bash
# 1. 将脚本部署到服务器（rsync 会同步 scripts/ 目录）
# 2. 注册定时任务（每天凌晨 3:00 执行）
crontab -e
```

添加一行：

```cron
0 3 * * * /www/wwwroot/money_book/scripts/money_db_backup.sh
```

脚本内容（可根据实际路径修改）：

```bash
DB_DIR="/www/wwwroot/money_book/src/data"     # 数据库目录
BACKUP_DIR="/root/synology/money_db_bak"       # 备份存放目录（可改为 NAS/远程挂载）
RETENTION_DAYS=7                                # 保留最近 7 天的备份

# VACUUM INTO 不停服生成单文件快照
sqlite3 "$DB_DIR/money.db" \
  "VACUUM INTO '$BACKUP_DIR/money-$(date +%Y%m%d-%H%M%S).db'"

# 清理 7 天前的旧备份
find "$BACKUP_DIR" -name 'money-*.db' -mtime +$RETENTION_DAYS -delete
```

选择说明：
- `VACUUM INTO` 会自动合并 WAL 日志到主库，生成 **单个完整的 `.db` 文件**，无需同时备份 `.db-wal` 和 `.db-shm`
- 备份期间应用**无需停机**，不影响用户使用
- 生成的单文件可随意拷贝、scp、上传到 NAS

**清空数据重新初始化**（停止服务后执行）：

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

启动后浏览器访问应用，左侧导航包含三个入口：**仪表盘** / **全部账单** / **管理**。移动端为底部 Tab 切换。

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

> 💡 中国 A 股惯例：**涨红跌绿**。本应用中收入用绿色、支出用红色，遵循通用财务展示习惯。
