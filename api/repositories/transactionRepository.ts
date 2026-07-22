import { randomUUID } from 'crypto';
import type { Transaction, TransactionInput, TransactionQuery } from '../../shared/types.js';
import { db } from '../data/db.js';

/** 数据库行结构（snake_case） */
interface TxRow {
  id: string;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  payment_method: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 把行记录映射为对外 Transaction（驼峰） */
function rowToTransaction(row: TxRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    amount: row.amount,
    type: row.type,
    category: row.category,
    paymentMethod: row.payment_method,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 数据访问层（Repository）—— SQLite 实现
 *
 * - 方法签名与之前的内存实现保持一致
 * - 业务层（service/controller）完全无感切换
 * - 数据持久化在 data/money.db，重启服务数据保留
 */
class TransactionRepository {
  /** 查询列表，支持 month / type / paymentMethod / category 过滤 */
  list(query: TransactionQuery = {}): Transaction[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (query.month) {
      conditions.push('date LIKE :month');
      params.month = `${query.month}%`;
    }
    if (query.type) {
      conditions.push('type = :type');
      params.type = query.type;
    }
    if (query.paymentMethod) {
      conditions.push('payment_method = :paymentMethod');
      params.paymentMethod = query.paymentMethod;
    }
    if (query.category) {
      conditions.push('category = :category');
      params.category = query.category;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT * FROM transactions ${whereClause} ORDER BY date DESC, created_at DESC`,
      )
      .all(params) as TxRow[];

    return rows.map(rowToTransaction);
  }

  /** 按 id 查找单条 */
  findById(id: string): Transaction | undefined {
    const row = db
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(id) as TxRow | undefined;
    return row ? rowToTransaction(row) : undefined;
  }

  /** 创建 */
  create(input: TransactionInput): Transaction {
    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO transactions (id, date, amount, type, category, payment_method, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.date,
      input.amount,
      input.type,
      input.category,
      input.paymentMethod,
      input.note ?? null,
      now,
      now,
    );
    return {
      ...input,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** 更新，返回更新后的记录；不存在返回 undefined */
  update(id: string, input: Partial<TransactionInput>): Transaction | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const merged: Transaction = {
      ...existing,
      ...input,
      id,
      updatedAt: new Date().toISOString(),
    };

    db.prepare(
      `UPDATE transactions
       SET date = ?, amount = ?, type = ?, category = ?, payment_method = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      merged.date,
      merged.amount,
      merged.type,
      merged.category,
      merged.paymentMethod,
      merged.note ?? null,
      merged.updatedAt,
      id,
    );

    return merged;
  }

  /** 删除，返回是否删除成功 */
  delete(id: string): boolean {
    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /** 统计某个分类被多少条交易引用（同时匹配 type 避免歧义） */
  countByCategory(type: 'income' | 'expense', name: string): number {
    const row = db
      .prepare(
        'SELECT COUNT(*) AS n FROM transactions WHERE type = ? AND category = ?',
      )
      .get(type, name) as { n: number };
    return row.n;
  }

  /** 统计某个支付方式被多少条交易引用 */
  countByPaymentMethod(name: string): number {
    const row = db
      .prepare('SELECT COUNT(*) AS n FROM transactions WHERE payment_method = ?')
      .get(name) as { n: number };
    return row.n;
  }
}

/** 单例仓库 */
export const transactionRepository = new TransactionRepository();
