/**
 * 历史账单 code 字段迁移脚本（全量重新生成）
 *
 * 用途：
 *   - 首次启用 code 字段时：为所有 code IS NULL 的记录补齐
 *   - 编号格式变更时（如本次 4 位序号 → 2 位序号）：全量重新生成所有记录的编号
 *
 * 编号规则：`{支付方式代码}-{YYYYMMDDHHmmss}-{2位序号}`
 *   - 时间戳取自记录的 created_at（UTC → 本地时区），保留原始创建时间信息
 *   - 同前缀（支付方式+秒）按 created_at 升序编号 01, 02, 03...
 *   - 序号 > 99 时自然扩展为 3 位（100+），不丢数据
 *
 * 幂等：可重复执行。每次都按当前规则全量重算并 UPDATE。
 *
 * 用法：
 *   npx tsx scripts/migrate-transaction-codes.ts            # 默认 data/money.db
 *   DB_PATH=/path/to.db npx tsx scripts/migrate-transaction-codes.ts
 *
 * 安全：建议执行前先 `cp data/money.db data/money-backup-$(date +%Y%m%d-%H%M%S).db`
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { paymentMethodToCode, formatTimestamp } from '../api/utils/txCode.js';

interface Row {
  id: string;
  payment_method: string;
  created_at: string;
}

function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  return path.resolve(process.cwd(), 'data/money.db');
}

function main(): void {
  const dbPath = resolveDbPath();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 检查 code 列是否存在
  const cols = db.prepare('PRAGMA table_info(transactions)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'code')) {
    console.error(`[migrate] transactions.code 列不存在，请先启动后端触发 schema 迁移`);
    process.exit(1);
  }

  // 全量读取所有记录（不区分 code 是否为 NULL，统一重算）
  const rows = db
    .prepare(
      'SELECT id, payment_method, created_at FROM transactions ORDER BY created_at ASC, id ASC',
    )
    .all() as Row[];

  if (rows.length === 0) {
    console.log(`[migrate] 数据库无 transactions 记录，无需迁移`);
    db.close();
    return;
  }

  console.log(`[migrate] 共 ${rows.length} 条记录，开始全量重新生成编号...`);

  // 两步走避免唯一索引冲突：
  //   1. 先把所有 code 置 NULL（清空旧编号，含 4 位格式的历史值）
  //   2. 再按新规则逐条 UPDATE 回填
  // 全程包裹在单个事务内，任一步失败回滚保证一致性。
  const clearAll = db.prepare('UPDATE transactions SET code = NULL');
  const updateOne = db.prepare('UPDATE transactions SET code = ? WHERE id = ?');

  const tx = db.transaction(() => {
    clearAll.run();

    const prefixCounter = new Map<string, number>();
    for (const row of rows) {
      const created = new Date(row.created_at);
      const ts = formatTimestamp(created);
      const pmCode = paymentMethodToCode(row.payment_method);
      const prefix = `${pmCode}-${ts}`;
      const seq = (prefixCounter.get(prefix) ?? 0) + 1;
      prefixCounter.set(prefix, seq);
      // padStart(2)：1→"01"，99→"99"，100→"100"（自然扩展）
      const code = `${prefix}-${String(seq).padStart(2, '0')}`;
      updateOne.run(code, row.id);
    }
  });

  tx();
  console.log(`[migrate] 完成：成功重生成 ${rows.length} 条记录的编号`);

  // 校验：无 NULL 残留 + 无重复
  const stillNull = (
    db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE code IS NULL').get() as { n: number }
  ).n;
  const dupes = db
    .prepare(
      `SELECT code, COUNT(*) AS n FROM transactions WHERE code IS NOT NULL GROUP BY code HAVING n > 1`,
    )
    .all() as Array<{ code: string; n: number }>;
  if (stillNull > 0) {
    console.error(`[migrate][错误] 仍有 ${stillNull} 条记录 code 为 NULL`);
    process.exit(1);
  }
  if (dupes.length > 0) {
    console.error(`[migrate][错误] 发现 ${dupes.length} 组重复 code:`);
    dupes.slice(0, 10).forEach((d) => console.error(`  ${d.code} × ${d.n}`));
    process.exit(1);
  }

  // 显示前缀分布，便于人工核对
  const overflow = db
    .prepare(
      `SELECT SUBSTR(code, INSTR(code, '-', INSTR(code, '-') + 1) + 1) AS seq,
              COUNT(*) AS n
       FROM transactions
       GROUP BY seq
       HAVING LENGTH(seq) > 2
       ORDER BY seq
       LIMIT 5`,
    )
    .all() as Array<{ seq: string; n: number }>;
  if (overflow.length > 0) {
    console.log(`[migrate] 检测到 ${overflow.length} 种 ≥3 位序号（说明前缀内 > 99 条）:`);
    overflow.forEach((o) => console.log(`  序号 ${o.seq} × ${o.n}`));
  }

  console.log(`[migrate] 校验通过：0 NULL / 0 重复`);
  db.close();
}

main();
