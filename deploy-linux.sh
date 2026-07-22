#!/usr/bin/env bash
#
# Money Tracker - Linux 一键部署脚本
#
# 功能（安全升级，不丢数据）：
#   1.  root 权限检查
#   2.  检测/安装 Node.js LTS（Debian/Ubuntu 用 NodeSource，RHEL 系用 rpm.nodesource.com）
#   3.  校验项目源码（package.json）
#   4.  停止已运行的 systemd 服务（释放文件锁）
#   5.  备份现有数据库 data/money.db* （保留历史数据）
#   6.  拷贝项目文件到目标目录（自动排除 node_modules/dist/.git/data）
#   7.  npm install + npm run build + npm prune --omit=dev + 恢复数据库
#   8.  注册/更新 systemd 服务（开机自启、崩溃自动重启、日志轮转）
#   9.  放行防火墙端口（ufw / firewalld / iptables 自动探测）
#  10.  启动服务
#  11.  健康检查
#  12.  输出访问地址
#
# 用法：
#   sudo bash deploy-linux.sh                       # 默认参数
#   sudo bash deploy-linux.sh -p 5391 -i /opt/mt    # 自定义端口和目录
#   sudo PORT=5391 bash deploy-linux.sh             # 也可用环境变量
#
# 适用系统：Debian 11/12/13、Ubuntu 20.04/22.04/24.04、CentOS/RHEL/Rocky/Alma 8+
#

set -euo pipefail

# ============== 默认参数 ==============
INSTALL_DIR="/opt/money-tracker"
PORT="${PORT:-5391}"
SERVICE_NAME="money-tracker"
SERVICE_DISPLAY_NAME="Money Tracker App"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MAJOR="20"          # Node.js LTS 大版本
SKIP_NODE_INSTALL=0
SKIP_BUILD=0
FORCE=0

# 从环境变量或命令行参数覆盖（命令行优先）
while [[ $# -gt 0 ]]; do
    case "$1" in
        -i|--install-dir) INSTALL_DIR="$2"; shift 2 ;;
        -p|--port)        PORT="$2"; shift 2 ;;
        -s|--service)     SERVICE_NAME="$2"; shift 2 ;;
        --source)         SOURCE_DIR="$2"; shift 2 ;;
        --node-major)     NODE_MAJOR="$2"; shift 2 ;;
        --skip-node)      SKIP_NODE_INSTALL=1; shift ;;
        --skip-build)     SKIP_BUILD=1; shift ;;
        --force)          FORCE=1; shift ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "未知参数: $1"; exit 1 ;;
    esac
done

# ============== 日志辅助 ==============
step() { printf "\n\033[36m[STEP]\033[0m %s\n" "$*"; }
ok()   { printf "  \033[32m[OK]\033[0m  %s\n" "$*"; }
warn() { printf "  \033[33m[WARN]\033[0m %s\n" "$*"; }
err()  { printf "  \033[31m[ERR]\033[0m %s\n" "$*"; }

# ============== 启动横幅 ==============
cat <<EOF

==========================================================
  Money Tracker - Linux Deployment
==========================================================
  InstallDir   : $INSTALL_DIR
  Port         : $PORT
  ServiceName  : $SERVICE_NAME
  SourceDir    : $SOURCE_DIR
  NodeMajor    : $NODE_MAJOR
  SkipNodeInst : $SKIP_NODE_INSTALL
  SkipBuild    : $SKIP_BUILD
  Force        : $FORCE
==========================================================
EOF

# ============== 1. root 权限检查 ==============
step "检查 root 权限..."
if [[ $EUID -ne 0 ]]; then
    err "请以 root 身份运行（或使用 sudo）"
    echo "  解决：sudo bash $0"
    exit 1
fi
ok "已是 root"

# ============== 2. Node.js 检测/安装 ==============
step "检查 Node.js..."
need_install_node=1

if command -v node >/dev/null 2>&1; then
    NODE_VERSION_RAW="$(node -v 2>/dev/null || true)"
    NODE_VERSION="${NODE_VERSION_RAW#v}"
    NODE_INSTALLED_MAJOR="${NODE_VERSION%%.*}"
    if [[ "$NODE_INSTALLED_MAJOR" =~ ^[0-9]+$ ]] && [[ "$NODE_INSTALLED_MAJOR" -ge "$NODE_MAJOR" ]]; then
        ok "已安装 Node.js $NODE_VERSION_RAW"
        need_install_node=0
    else
        warn "Node.js 版本过低 ($NODE_VERSION_RAW)，需要 >= v$NODE_MAJOR，将升级"
    fi
fi

if [[ "$need_install_node" -eq 1 ]]; then
    if [[ "$SKIP_NODE_INSTALL" -eq 1 ]]; then
        warn "--skip-node 已指定，但 Node 未安装/版本过低，后续步骤将失败"
        exit 1
    fi

    step "安装 Node.js v$NODE_MAJOR LTS ..."

    # 探测包管理器和发行版
    if command -v apt-get >/dev/null 2>&1; then
        # Debian / Ubuntu
        # 注意：Debian 13 (trixie) 默认仓库的 nodejs 可能是 18/20/22，但版本较旧；
        # 用 NodeSource 拿到最新 LTS 更稳。如果 NodeSource 不可用，回退到系统仓库。
        ok "检测到 apt-get (Debian/Ubuntu)"
        if ! command -v curl >/dev/null 2>&1; then
            apt-get update -y && apt-get install -y curl >/dev/null
        fi
        # 尝试 NodeSource（推荐）
        if curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - 2>/dev/null; then
            apt-get install -y nodejs >/dev/null
        else
            warn "NodeSource 不可用，回退到系统仓库（版本可能较旧）"
            apt-get update -y >/dev/null
            apt-get install -y nodejs npm >/dev/null
        fi
    elif command -v dnf >/dev/null 2>&1; then
        # Fedora / RHEL 8+ / Rocky / Alma
        ok "检测到 dnf (RHEL 系)"
        curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
        dnf install -y nodejs
    elif command -v yum >/dev/null 2>&1; then
        # 旧版 CentOS/RHEL 7
        ok "检测到 yum (旧版 RHEL 系)"
        curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
        yum install -y nodejs
    else
        err "未识别的包管理器（既无 apt-get 也无 dnf/yum）"
        echo "  请手动安装 Node.js >= v$NODE_MAJOR：https://nodejs.org/en/download/package-manager/"
        exit 1
    fi

    # 验证
    if ! command -v node >/dev/null 2>&1; then
        err "Node.js 安装后仍未在 PATH 中找到"
        exit 1
    fi
    ok "Node.js 安装成功: $(node -v)"
fi

if ! command -v npm >/dev/null 2>&1; then
    err "找不到 npm"
    exit 1
fi
ok "npm 版本: $(npm -v)"

# ============== 3. 源码检查 ==============
step "校验项目源码..."
if [[ ! -f "$SOURCE_DIR/package.json" ]]; then
    err "在 $SOURCE_DIR 找不到 package.json"
    echo "  请将此脚本放到项目根目录（含 package.json 的目录）"
    exit 1
fi
ok "package.json 已找到"

# ============== 4. 停止已运行的服务 ==============
step "检查并停止已运行的服务..."
SERVICE_WAS_RUNNING=0
if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE_NAME}\.service"; then
    SERVICE_STATE="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo unknown)"
    if [[ "$SERVICE_STATE" == "active" ]]; then
        echo "  服务 [$SERVICE_NAME] 正在运行，正在停止..."
        systemctl stop "$SERVICE_NAME"
        sleep 2
        SERVICE_WAS_RUNNING=1
        ok "服务已停止"
    else
        ok "服务已存在但未运行（状态: $SERVICE_STATE）"
    fi
else
    ok "服务尚未注册（首次部署）"
fi

# 兜底：如果有遗留的 node 进程占用端口，杀掉
LISTEN_PID="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
if [[ -n "$LISTEN_PID" ]]; then
    warn "端口 $PORT 仍被 PID $LISTEN_PID 占用，强制终止"
    kill -9 "$LISTEN_PID" 2>/dev/null || true
    sleep 1
fi

# ============== 5. 备份现有数据库 ==============
step "备份现有数据库..."
DB_BACKUP_DIR=""
EXISTING_DB="$INSTALL_DIR/data/money.db"
if [[ -f "$EXISTING_DB" ]]; then
    STAMP="$(date +%Y%m%d-%H%M%S)"
    DB_BACKUP_DIR="/tmp/money-db-backup-$STAMP"
    mkdir -p "$DB_BACKUP_DIR"
    # 备份所有 .db* 相关文件（主库 + WAL + SHM）
    for f in "$INSTALL_DIR"/data/money.db*; do
        [[ -f "$f" ]] && cp "$f" "$DB_BACKUP_DIR/"
    done
    SIZE_KB="$(du -k "$EXISTING_DB" | cut -f1)"
    ok "已备份数据库 (${SIZE_KB}KB) 到: $DB_BACKUP_DIR"
    echo "  备份文件: $(ls "$DB_BACKUP_DIR" | tr '\n' ' ')"
else
    # 没找到数据库，检查是否 INSTALL_DIR 设置不对
    warn "在 $EXISTING_DB 未找到数据库"
    echo "  如果确认已有部署，可能原因："
    echo "    1)  --install-dir (-i) 参数不对 → 实际路径不是 $INSTALL_DIR"
    echo "    2)  数据库文件不在 data/ 子目录下"
    echo ""
    echo "  建议先确认实际部署路径："
    echo "    systemctl status money-tracker   # 查看 WorkingDirectory"
    echo "    find / -name money.db 2>/dev/null  # 查找数据库位置"
    echo ""
    echo "  然后重新运行："
    echo "    sudo bash deploy-linux.sh -i <实际路径>"
    echo ""
    # 如果服务正在运行，说明数据库肯定存在，阻止继续执行
    if [[ "$SERVICE_WAS_RUNNING" -eq 1 ]]; then
        err "服务 [$SERVICE_NAME] 正在运行但找不到数据库，INSTALL_DIR 似乎设置错误"
        echo "  建议立即停止操作，确认正确的 INSTALL_DIR 后重试"
        exit 1
    fi
    ok "（首次部署，跳过备份）"
fi

# ============== 6. 拷贝项目文件 ==============
step "部署项目到 $INSTALL_DIR ..."
if [[ -d "$INSTALL_DIR" ]]; then
    if [[ "$FORCE" -eq 1 ]]; then
        warn "目标目录已存在，--force 模式：清空重建"
        rm -rf "$INSTALL_DIR"
        mkdir -p "$INSTALL_DIR"
    else
        ok "目标目录已存在，增量更新（保留 node_modules）"
    fi
else
    mkdir -p "$INSTALL_DIR"
    ok "目标目录已创建"
fi

# rsync 优先（更可控）；不可用时退到 cp
echo "  正在拷贝项目文件..."
if command -v rsync >/dev/null 2>&1; then
    rsync -a \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='.git' \
        --exclude='data' \
        --exclude='.env' \
        --exclude='.env.local' \
        --exclude='.DS_Store' \
        "$SOURCE_DIR"/ "$INSTALL_DIR"/
else
    # macOS/BSD 的 cp 与 GNU cp 行为不同，显式 -R 更稳
    # 注意：这里无法精细排除，所以先把要排除的东西临时挪走
    # 为简化，强烈推荐先 apt-get install -y rsync
    if [[ ! -d "$INSTALL_DIR/node_modules" ]]; then
        cp -R "$SOURCE_DIR"/. "$INSTALL_DIR"/
        # 清掉不应带过去的
        rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/dist" "$INSTALL_DIR/.git" 2>/dev/null || true
        rm -rf "$INSTALL_DIR/data" 2>/dev/null || true
        rm -f "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.local" 2>/dev/null || true
    else
        # 增量更新：保留 node_modules，只同步源码
        TMPSRC="$(mktemp -d)"
        cp -R "$SOURCE_DIR"/. "$TMPSRC"/
        rm -rf "$TMPSRC/node_modules" "$TMPSRC/dist" "$TMPSRC/.git" 2>/dev/null || true
        rm -rf "$TMPSRC/data" 2>/dev/null || true
        rm -f "$TMPSRC/.env" "$TMPSRC/.env.local" 2>/dev/null || true
        cp -R "$TMPSRC"/. "$INSTALL_DIR"/
        rm -rf "$TMPSRC"
    fi
fi
ok "项目文件拷贝完成"

# ============== 7. 安装依赖 + 构建 + 清理 ==============
cd "$INSTALL_DIR"

step "安装依赖（npm install）..."
if ! npm install --no-audit --no-fund; then
    err "npm install 失败"
    echo ""
    echo "  常见原因与解决：" | sed 's/^/  /'
    echo "    [1] better-sqlite3 原生模块编译失败" | sed 's/^/  /'
    echo "        → 安装编译工具链：apt-get install -y build-essential python3" | sed 's/^/  /'
    echo "    [2] 网络问题导致下载失败" | sed 's/^/  /'
    echo "        → 设置镜像：npm config set registry https://registry.npmmirror.com" | sed 's/^/  /'
    echo "    [3] 权限问题" | sed 's/^/  /'
    echo "        → 确认 $INSTALL_DIR 当前用户可写" | sed 's/^/  /'
    exit 1
fi
ok "依赖安装完成"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
    step "构建前端（npm run build）..."
    if ! npm run build; then
        err "构建失败"
        exit 1
    fi
    if [[ ! -f "$INSTALL_DIR/dist/index.html" ]]; then
        err "构建后未找到 dist/index.html"
        exit 1
    fi
    ok "前端构建完成"
else
    warn "已跳过构建（--skip-build）"
fi

step "清理开发依赖（减小体积）..."
npm prune --omit=dev >/dev/null 2>&1 || true
ok "清理完成"

# ============== 恢复数据库 ==============
if [[ -n "$DB_BACKUP_DIR" ]] && [[ -d "$DB_BACKUP_DIR" ]]; then
    step "恢复历史数据库..."
    mkdir -p "$INSTALL_DIR/data"
    cp "$DB_BACKUP_DIR"/money.db* "$INSTALL_DIR/data/" 2>/dev/null || true
    if [[ -f "$INSTALL_DIR/data/money.db" ]]; then
        SIZE_KB="$(du -k "$INSTALL_DIR/data/money.db" | cut -f1)"
        ok "已恢复数据库 (${SIZE_KB}KB)，历史数据保留"
    else
        warn "备份目录为空，首次启动将自动初始化演示数据"
    fi
else
    step "无需恢复数据库（首次部署）"
    ok "首次启动将自动初始化演示数据"
fi

# ============== 8. 注册 systemd 服务 ==============
step "注册 systemd 服务 [$SERVICE_NAME] ..."

# 修正目录归属（让 systemd 用 www-data 跑时也能写入 logs/data）
# 这里简化处理：直接用 root 跑（生产可自行调整为 www-data 等非特权用户）
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=$SERVICE_DISPLAY_NAME
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=$(command -v node) $(command -v tsx 2>/dev/null || echo "$INSTALL_DIR/node_modules/.bin/tsx") api/server.ts
Restart=on-failure
RestartSec=5
# 日志交给 journald，使用 journalctl -u $SERVICE_NAME 查看

[Install]
WantedBy=multi-user.target
EOF

# 确保 tsx 路径正确：如果系统 PATH 里没有，用项目内的
if ! command -v tsx >/dev/null 2>&1; then
    if [[ -x "$INSTALL_DIR/node_modules/.bin/tsx" ]]; then
        sed -i "s|ExecStart=.*|ExecStart=$(command -v node) $INSTALL_DIR/node_modules/.bin/tsx api/server.ts|" "$SERVICE_FILE"
    else
        err "找不到 tsx CLI"
        echo "  请检查 $INSTALL_DIR/node_modules/.bin/tsx 是否存在"
        exit 1
    fi
fi

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
ok "服务已注册（$SERVICE_FILE）"

# ============== 9. 防火墙 ==============
step "放行防火墙端口 $PORT/tcp ..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow "$PORT"/tcp >/dev/null 2>&1 || true
    ok "ufw 已放行 $PORT/tcp"
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="$PORT"/tcp >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
    ok "firewalld 已放行 $PORT/tcp"
elif command -v iptables >/dev/null 2>&1; then
    # 简单兜底；若用 firewalld 请优先用上面那条
    iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null || true
    ok "iptables 已放行 $PORT/tcp（重启可能失效，建议配置持久化）"
else
    warn "未检测到防火墙工具（ufw/firewalld/iptables），请手动放行 $PORT/tcp"
fi

# ============== 10. 启动服务 ==============
step "启动服务..."
systemctl restart "$SERVICE_NAME"
sleep 4

if [[ "$(systemctl is-active "$SERVICE_NAME")" != "active" ]]; then
    err "服务未运行，状态: $(systemctl is-active "$SERVICE_NAME")"
    echo "  查看日志：journalctl -u $SERVICE_NAME -n 50 --no-pager"
    exit 1
fi
SERVICE_PID="$(systemctl show -p MainPID --value "$SERVICE_NAME")"
ok "服务已启动 (PID: $SERVICE_PID)"

# ============== 11. 健康检查 ==============
step "健康检查..."
HEALTH_OK=0
for i in 1 2 3 4 5; do
    sleep 2
    if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/health" 2>/dev/null; then
        HEALTH_OK=1
        ok "健康检查通过（第 $i 次尝试）"
        break
    fi
    echo "  第 $i 次尝试未就绪，等待重试..."
done
if [[ "$HEALTH_OK" -ne 1 ]]; then
    warn "健康检查未通过（服务可能仍在启动中）"
    echo "  稍候手动验证：curl http://127.0.0.1:$PORT/api/health"
    echo "  查看日志：journalctl -u $SERVICE_NAME -n 50 --no-pager"
fi

# ============== 12. 完成 ==============
# 探测本机 IP
IP_LIST="$(hostname -I 2>/dev/null || true)"

echo ""
echo "==========================================================" | sed 's/^/\033[32m/; s/$/\033[0m/'
echo "  [DONE] 部署完成！" | sed 's/^/\033[32m/; s/$/\033[0m/'
echo "==========================================================" | sed 's/^/\033[32m/; s/$/\033[0m/'
echo ""
echo "  访问地址:"
echo "    http://localhost:$PORT/"
if [[ -n "$IP_LIST" ]]; then
    for ip in $IP_LIST; do
        echo "    http://${ip}:$PORT/"
    done
fi
echo ""
echo "  API:"
echo "    http://localhost:$PORT/api/v1/"
echo "    http://localhost:$PORT/api/health"
echo ""
echo "  项目目录:    $INSTALL_DIR"
echo "  服务名称:    $SERVICE_NAME"
echo "  服务文件:    $SERVICE_FILE"
echo "  数据库:      $INSTALL_DIR/data/money.db"
if [[ -n "$DB_BACKUP_DIR" ]] && [[ -d "$DB_BACKUP_DIR" ]]; then
    echo "  数据库备份:  $DB_BACKUP_DIR"
fi
echo ""
echo "  常用管理命令:"
echo "    sudo systemctl start $SERVICE_NAME          # 启动"
echo "    sudo systemctl stop $SERVICE_NAME           # 停止"
echo "    sudo systemctl restart $SERVICE_NAME        # 重启"
echo "    sudo systemctl status $SERVICE_NAME         # 查看状态"
echo "    sudo journalctl -u $SERVICE_NAME -f         # 实时查看日志"
echo "    sudo journalctl -u $SERVICE_NAME -n 100     # 查看最近 100 行日志"
echo ""
echo "  更新代码后重新部署（自动备份/恢复数据库）:"
echo "    sudo bash $0 --force"
echo ""
echo "  手动备份数据库:"
echo "    cp $INSTALL_DIR/data/money.db ~/money-backup-\$(date +%Y%m%d).db"
echo ""
