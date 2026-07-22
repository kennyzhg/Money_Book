#!/usr/bin/env bash
#
# Money Tracker - 数据库定时备份脚本
# 用途：cron 定时执行，VACUUM INTO 不停服生成单文件快照
# 部署到服务器后，注册 cron：crontab -e → 0 3 * * * /www/wwwroot/money_book/scripts/money_db_backup.sh
#

set -euo pipefail

DB_DIR="/www/wwwroot/money_book/src/data"
BACKUP_DIR="/root/synology/money_db_bak"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

# 生成一个完整个单文件快照（VACUUM INTO），不停服
sqlite3 "$DB_DIR/money.db" \
  "VACUUM INTO '$BACKUP_DIR/money-$(date +%Y%m%d-%H%M%S).db'"

# 删除 7 天前的旧备份
find "$BACKUP_DIR" -name 'money-*.db' -mtime +$RETENTION_DAYS -delete

echo "[$(date)] 备份完成，保留最近 $RETENTION_DAYS 天"
