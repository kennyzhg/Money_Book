#!/usr/bin/env bash
#
# Money Tracker - 数据库恢复脚本
#
# 用途：从备份目录中选择一个备份文件，恢复到部署目录的 data/ 下
#
# 使用前必做：
#   1. 修改下方 DB_DIR 为你的实际部署目录（存放 money.db 的位置）
#   2. 修改 BACKUP_DIR 为你的实际备份目录
#   3. 确保目标数据库文件（money.db）没有被服务占用（先停服务）
#
# 用法：
#   chmod +x scripts/money_db_restore.sh
#   ./scripts/money_db_restore.sh
#

set -euo pipefail

# ===================================================================
# >>> 请根据你的实际部署环境修改以下两个变量 <<<
# ===================================================================

# 部署目录（money.db 所在父目录下的 data/ 子目录）
# 默认值：/www/wwwroot/money_book/src
# 如你的部署目录不同，请修改此行
DEPLOY_DIR="/www/wwwroot/money_book/src"

# 备份文件存放目录
# 默认值：/root/synology/money_db_bak
# 如你的备份路径不同，请修改此行
BACKUP_DIR="/root/synology/money_db_bak"

# ===================================================================
# 以下内容无需修改
# ===================================================================

DB_DIR="$DEPLOY_DIR/data"
TARGET_DB="$DB_DIR/money.db"

# 颜色提示
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  Money Tracker - 数据库恢复工具"
echo "========================================"
echo ""
echo "当前配置："
echo "  部署目录:    $DEPLOY_DIR"
echo "  数据目录:    $DB_DIR"
echo "  备份目录:    $BACKUP_DIR"
echo ""
echo -e "${YELLOW}⚠ 如果上述路径与你的实际环境不符，请先编辑本脚本，"
echo "   修改脚本头部的 DEPLOY_DIR 和 BACKUP_DIR 变量。${NC}"
echo ""

# 检查备份目录
if [ ! -d "$BACKUP_DIR" ]; then
  echo -e "${RED}✗ 备份目录不存在: $BACKUP_DIR${NC}"
  echo "  请先确认备份目录是否正确，或先执行 money_db_backup.sh 创建备份。"
  exit 1
fi

# 列出可用备份
BACKUP_FILES=($(ls -t "$BACKUP_DIR"/money-*.db 2>/dev/null || true))
COUNT=${#BACKUP_FILES[@]}

if [ "$COUNT" -eq 0 ]; then
  echo -e "${RED}✗ 备份目录中未找到任何备份文件（money-*.db）${NC}"
  echo "  备份文件命名格式：money-YYYYMMDD-HHMMSS.db"
  exit 1
fi

echo "找到 $COUNT 个备份文件："
echo ""
for i in "${!BACKUP_FILES[@]}"; do
  F="${BACKUP_FILES[$i]}"
  SIZE=$(stat --printf="%s" "$F" 2>/dev/null || stat -f%z "$F" 2>/dev/null || echo "?")
  SIZE_HR=$(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B")
  echo "  [$((i+1))] $(basename "$F")  (${SIZE_HR})"
done
echo ""

# 让用户选择
read -p "请输入要恢复的备份编号 [1-$COUNT]: " SELECTION

if ! [[ "$SELECTION" =~ ^[0-9]+$ ]] || [ "$SELECTION" -lt 1 ] || [ "$SELECTION" -gt "$COUNT" ]; then
  echo -e "${RED}✗ 无效选择，已退出。${NC}"
  exit 1
fi

SELECTED="${BACKUP_FILES[$((SELECTION-1))]}"
SELECTED_NAME=$(basename "$SELECTED")

echo ""
echo "已选择: $SELECTED_NAME"

# 检查部署目录
if [ ! -d "$DB_DIR" ]; then
  echo -e "${YELLOW}! 数据目录不存在，自动创建: $DB_DIR${NC}"
  mkdir -p "$DB_DIR"
fi

# 检查服务是否在运行
if command -v systemctl &>/dev/null; then
  if systemctl is-active --quiet money-tracker 2>/dev/null; then
    echo -e "${RED}✗ services money-tracker 正在运行！${NC}"
    echo "  恢复前必须停止服务，否则数据库可能被锁定或被覆盖后自动重置。"
    read -p "是否立即停止服务？(y/N): " STOP_CONFIRM
    if [[ "$STOP_CONFIRM" =~ ^[Yy]$ ]]; then
      sudo systemctl stop money-tracker
      echo -e "${GREEN}✓ 服务已停止${NC}"
    else
      echo "已取消恢复。"
      exit 1
    fi
  fi
fi

# 最终确认
echo ""
echo -e "${RED}========================================${NC}"
echo -e "${RED}  即将执行恢复操作：${NC}"
echo "    来源: $SELECTED_NAME"
echo "    目标: $TARGET_DB"
echo ""
echo -e "${RED}  注意：目标数据库将被覆盖！${NC}"
echo -e "${RED}========================================${NC}"
echo ""
read -p "确认恢复？(y/N): " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "已取消恢复。"
  exit 0
fi

# 备份当前数据库（自动备份）
if [ -f "$TARGET_DB" ]; then
  AUTO_BACKUP="$BACKUP_DIR/pre-restore-auto-$(date +%Y%m%d-%H%M%S).db"
  echo "正在备份当前数据库..."
  cp "$TARGET_DB" "$AUTO_BACKUP"
  echo -e "${GREEN}✓ 当前数据库已备份到: $AUTO_BACKUP${NC}"
fi

# 恢复
echo "正在恢复..."
cp "$SELECTED" "$TARGET_DB"

# 清理旧的 WAL/SHM 文件（避免 SQLite 使用过期锁）
rm -f "$TARGET_DB-wal" "$TARGET_DB-shm"

echo -e "${GREEN}✓ 恢复完成${NC}"
echo "  恢复文件: $SELECTED_NAME"
echo "  目标位置: $TARGET_DB"

# 提示重启服务
if command -v systemctl &>/dev/null; then
  echo ""
  echo -e "${YELLOW}! 请手动重启服务以生效：${NC}"
  echo "  sudo systemctl start money-tracker"
  echo ""
  echo "  或直接一键重启（当前终端需要 sudo 权限）："
  echo "  sudo systemctl restart money-tracker"
fi

echo ""
echo "完成。"
