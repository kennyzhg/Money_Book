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
import type { TransactionType } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 数据库文件目录（项目根/data） */
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/** 数据库文件路径 */
export const DB_PATH = path.join(dataDir, 'money.db');

/** 全局数据库实例（单例） */
export const db = new Database(DB_PATH);

// 启用 WAL 模式：读写并发性能更好，崩溃恢复更可靠
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * 建表（幂等）。若已存在则跳过。
 */
export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id            TEXT PRIMARY KEY,
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

    // 3. 迁移交易（生成 id + 时间戳）
    if (txCount === 0) {
      const insertTx = db.prepare(
        `INSERT INTO transactions (id, date, amount, type, category, payment_method, note, created_at, updated_at)
         VALUES (@id, @date, @amount, @type, @category, @payment_method, @note, @created_at, @updated_at)`,
      );
      const now = new Date().toISOString();
      seedData.forEach((t) => {
        insertTx.run({
          id: crypto.randomUUID(),
          date: t.date,
          amount: t.amount,
          type: t.type,
          category: t.category,
          payment_method: t.paymentMethod,
          note: t.note ?? null,
          created_at: now,
          updated_at: now,
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
seedIfEmpty();
