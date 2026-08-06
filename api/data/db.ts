/**
 * SQLite 数据库初始化与连接管理
 *
 * - 数据库文件：项目根目录 data/money.db（首次运行自动创建）
 * - 表结构：transactions / categories / payment_methods
 * - 启动时自动建表；表为空时自动从 seed 导入演示数据
 * - 启用 WAL 模式提升并发读写性能
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import seedData from '../data/seed.js';
import { initialConfig } from '../config/appConfig.js';
import { paymentMethodToCode, formatTimestamp } from '../utils/txCode.js';
import type { TransactionType } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 数据库文件目录（项目根/data） */
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/** 数据库文件路径
 *
 * 优先级：DB_PATH 环境变量 > 默认项目根/data/money.db
 * DB_PATH 便于脚本（migrate-transaction-codes.ts）与单元测试切换数据库，
 * 生产部署仍走默认路径。
 */
export const DB_PATH = process.env.DB_PATH || path.join(dataDir, 'money.db');

/** 全局数据库实例（单例） */
export const db = new Database(DB_PATH);

// 启用 WAL 模式：读写并发性能更好，崩溃恢复更可靠
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * 给已存在的 transactions 表补 code 列 + 唯一索引（幂等）。
 *
 * 调用顺序：必须先 initSchema()（保证 transactions 表存在）→ 再调用本函数。
 *
 * 为什么索引不放 initSchema：
 *   `CREATE TABLE IF NOT EXISTS` 不修改已存在表。老库 transactions 表已存在但无 code 列，
 *   若在 initSchema 内一并 `CREATE UNIQUE INDEX ON (code)`，会因列不存在直接抛
 *   `SqliteError: no such column: code` 导致服务启动失败。
 *   解决办法：先 ALTER 加列，再建索引，全部在本函数内串行完成。
 *
 * 唯一索引允许 NULL 共存（SQLite 行为），即便有未迁移的历史 NULL 记录也能建成功；
 * 后续 migrate-transaction-codes 脚本会把所有 NULL 补齐。
 */
function migrateTransactionsAddCode(): void {
  const cols = db.prepare('PRAGMA table_info(transactions)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'code')) {
    db.exec('ALTER TABLE transactions ADD COLUMN code TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_code ON transactions(code)');
}

/**
 * 建表（幂等）。若已存在则跳过。
 */
export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id            TEXT PRIMARY KEY,
      code          TEXT,
      date          TEXT NOT NULL,
      amount        REAL NOT NULL,
      type          TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      category      TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      note          TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON transactions(payment_method);
    -- code 列与对应唯一索引由 migrateTransactionsAddCode() 统一管理，
    -- 必须在 ALTER TABLE ADD COLUMN 之后才能建（老库 transactions 表已存在，
    -- CREATE TABLE IF NOT EXISTS 不会修改已有表结构，code 列此时可能尚未存在）。

    CREATE TABLE IF NOT EXISTS categories (
      type  TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      name  TEXT NOT NULL,
      icon  TEXT NOT NULL DEFAULT 'circle',
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (type, name)
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      name  TEXT PRIMARY KEY,
      icon  TEXT NOT NULL DEFAULT 'smartphone',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- ====== 财务规划模块 ======

    -- 分期贷款（车贷/房贷/电子产品分期）
    CREATE TABLE IF NOT EXISTS installments (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      kind            TEXT NOT NULL CHECK (kind IN ('car','house','electronics','other')),
      method          TEXT NOT NULL CHECK (method IN ('equal_payment','equal_principal')),
      principal       REAL NOT NULL,
      annual_rate     REAL NOT NULL,
      term_months     INTEGER NOT NULL,
      start_month     TEXT NOT NULL,
      category        TEXT NOT NULL,
      payment_method  TEXT NOT NULL,
      monthly_payment REAL NOT NULL,
      total_interest  REAL NOT NULL,
      total_payment   REAL NOT NULL,
      status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid_off','cancelled')),
      note            TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);
    CREATE INDEX IF NOT EXISTS idx_installments_start_month ON installments(start_month);

    -- 固定支出（每月可预见的固定开销）
    CREATE TABLE IF NOT EXISTS fixed_expenses (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      amount          REAL NOT NULL,
      category        TEXT NOT NULL,
      payment_method  TEXT NOT NULL,
      icon            TEXT NOT NULL DEFAULT 'repeat',
      enabled         INTEGER NOT NULL DEFAULT 1,
      start_month     TEXT NOT NULL,
      note            TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fixed_expenses_enabled ON fixed_expenses(enabled);

    -- 购物计划（下月计划购买的物品）
    CREATE TABLE IF NOT EXISTS shopping_plans (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      estimated_cost  REAL NOT NULL,
      priority        TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
      plan_month      TEXT NOT NULL,
      category        TEXT NOT NULL,
      payment_method  TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','purchased','cancelled')),
      actual_cost     REAL,
      purchased_date  TEXT,
      note            TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shopping_plans_month ON shopping_plans(plan_month);
    CREATE INDEX IF NOT EXISTS idx_shopping_plans_status ON shopping_plans(status);
  `);
}

/**
 * 若所有表为空，则从 seed/appConfig 导入初始数据。
 * 仅在首次启动（或数据库被清空）时执行。
 */
export function seedIfEmpty(): void {
  const txCount = (db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n;
  const catCount = (db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number }).n;
  const pmCount = (db.prepare('SELECT COUNT(*) AS n FROM payment_methods').get() as { n: number }).n;

  // 使用事务保证一致性
  const seed = db.transaction(() => {
    // 1. 迁移分类
    if (catCount === 0) {
      const insertCat = db.prepare(
        'INSERT INTO categories (type, name, icon, sort_order) VALUES (?, ?, ?, ?)',
      );
      (['income', 'expense'] as TransactionType[]).forEach((type) => {
        initialConfig.categories[type].forEach((item, idx) => {
          insertCat.run(type, item.name, item.icon, idx);
        });
      });
    }

    // 2. 迁移支付方式
    if (pmCount === 0) {
      const insertPm = db.prepare(
        'INSERT INTO payment_methods (name, icon, sort_order) VALUES (?, ?, ?)',
      );
      initialConfig.paymentMethods.forEach((item, idx) => {
        insertPm.run(item.name, item.icon, idx);
      });
    }

    // 3. 迁移交易（生成 id + code + 时间戳）
    if (txCount === 0) {
      const insertTx = db.prepare(
        `INSERT INTO transactions (id, code, date, amount, type, category, payment_method, note, created_at, updated_at)
         VALUES (@id, @code, @date, @amount, @type, @category, @payment_method, @note, @created_at, @updated_at)`,
      );
      const now = new Date();
      const iso = now.toISOString();
      const ts = formatTimestamp(now);
      seedData.forEach((t, idx) => {
        // seed 阶段所有记录时间戳相同，序号按数组顺序递增
        const pmCode = paymentMethodToCode(t.paymentMethod);
        const code = `${pmCode}-${ts}-${String(idx + 1).padStart(2, '0')}`;
        insertTx.run({
          id: crypto.randomUUID(),
          code,
          date: t.date,
          amount: t.amount,
          type: t.type,
          category: t.category,
          payment_method: t.paymentMethod,
          note: t.note ?? null,
          created_at: iso,
          updated_at: iso,
        });
      });
    }
  });

  seed();
  const total =
    txCount +
    catCount +
    pmCount;
  if (total === 0) {
    console.log(`[db] 初始化完成，已导入 ${seedData.length} 条演示数据`);
  }
}

// 模块加载即执行
initSchema();
migrateTransactionsAddCode();
seedIfEmpty();
