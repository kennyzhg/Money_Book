import { randomUUID } from 'crypto';
import type { Transaction, TransactionInput, TransactionQuery } from '../../shared/types.js';
import { db } from '../data/db.js';
import { paymentMethodToCode, formatTimestamp } from '../utils/txCode.js';

interface TxRow {
  id: string;
  code: string | null;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  payment_method: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTransaction(row: TxRow): Transaction {
  return {
    id: row.id,
    code: row.code ?? '',
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
 */
class TransactionRepository {
  /**
   * 构造 WHERE 子句与参数对象
   *
   * 过滤：month / year / type / paymentMethod / category / noteKeyword / code
   * 优先级：month 优先于 year；若同时提供，year 被忽略。
   */
  private buildFilter(query: TransactionQuery): {
    whereClause: string;
    params: Record<string, unknown>;
  } {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (query.month) {
      conditions.push('date LIKE :month');
      params.month = `${query.month}%`;
    } else if (query.year) {
      conditions.push('date LIKE :year');
      params.year = `${query.year}%`;
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
    if (query.code) {
      conditions.push('code = :code');
      params.code = query.code;
    }
    const noteKeyword = query.noteKeyword?.trim();
    if (noteKeyword) {
      conditions.push("note LIKE :noteKeyword ESCAPE '\\'");
      params.noteKeyword = `%${noteKeyword.replace(/[\\%_]/g, '\\$&')}%`;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * 生成下一编号
   *
   * 策略：在 better-sqlite3 同步执行路径下，先查同前缀最大序号 +1，
   * 同步调用栈内立即 INSERT，杜绝并发窗口。
   *
   * 前缀 = `{pmCode}-{timestamp}`，timestamp 精确到秒。
   * 序号默认 2 位（01-99），同秒内 > 99 条时自然扩展为 3 位（100+），不丢数据。
   *
   * 序号提取：按 `prefix + '-'` 之后到字符串末尾整段解析（不再用 SUBSTR 定长偏移），
   * 兼容 2 位与 3+ 位两种宽度。
   */
  private generateCode(paymentMethod: string, now: Date): string {
    const pmCode = paymentMethodToCode(paymentMethod);
    const ts = formatTimestamp(now);
    const prefix = `${pmCode}-${ts}`;
    const prefixWithSep = `${prefix}-`;

    const row = db
      .prepare(
        `SELECT MAX(CAST(SUBSTR(code, ?) AS INTEGER)) AS maxSeq
         FROM transactions
         WHERE code LIKE ?`,
      )
      .get(prefixWithSep.length + 1, `${prefix}-%`) as { maxSeq: number | null } | undefined;

    const nextSeq = (row?.maxSeq ?? 0) + 1;
    return `${prefixWithSep}${String(nextSeq).padStart(2, '0')}`;
  }

  list(query: TransactionQuery = {}): Transaction[] {
    const { whereClause, params } = this.buildFilter(query);

    const allParams: Record<string, unknown> = { ...params };
    let pagination = '';

    if (query.page !== undefined && query.pageSize !== undefined) {
      const offset = Math.max(0, (query.page - 1) * query.pageSize);
      pagination = `LIMIT :__limit OFFSET :__offset`;
      allParams.__limit = query.pageSize;
      allParams.__offset = offset;
    }

    const rows = db
      .prepare(
        `SELECT * FROM transactions ${whereClause} ORDER BY date DESC, created_at DESC ${pagination}`,
      )
      .all(allParams) as TxRow[];

    return rows.map(rowToTransaction);
  }

  count(query: TransactionQuery = {}): number {
    const { whereClause, params } = this.buildFilter(query);
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM transactions ${whereClause}`)
      .get(params) as { n: number };
    return row.n;
  }

  summary(query: TransactionQuery = {}): { totalIncome: number; totalExpense: number } {
    const { whereClause, params } = this.buildFilter(query);
    return db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS totalIncome,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS totalExpense
         FROM transactions ${whereClause}`,
      )
      .get(params) as { totalIncome: number; totalExpense: number };
  }

  findById(id: string): Transaction | undefined {
    const row = db
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(id) as TxRow | undefined;
    return row ? rowToTransaction(row) : undefined;
  }

  /** 按业务编号查找（外部稳定标识符入口） */
  findByCode(code: string): Transaction | undefined {
    const row = db
      .prepare('SELECT * FROM transactions WHERE code = ?')
      .get(code) as TxRow | undefined;
    return row ? rowToTransaction(row) : undefined;
  }

  create(input: TransactionInput): Transaction {
    const now = new Date();
    const iso = now.toISOString();
    const id = randomUUID();
    const code = this.generateCode(input.paymentMethod, now);

    db.prepare(
      `INSERT INTO transactions (id, code, date, amount, type, category, payment_method, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      code,
      input.date,
      input.amount,
      input.type,
      input.category,
      input.paymentMethod,
      input.note ?? null,
      iso,
      iso,
    );

    return {
      ...input,
      id,
      code,
      createdAt: iso,
      updatedAt: iso,
    };
  }

  update(id: string, input: Partial<TransactionInput>): Transaction | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const merged: Transaction = {
      ...existing,
      ...input,
      // code 永不变更：始终保持原值，客户端 patch 中的 code 一律忽略
      code: existing.code,
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

  delete(id: string): boolean {
    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  countByCategory(type: 'income' | 'expense', name: string): number {
    const row = db
      .prepare('SELECT COUNT(*) AS n FROM transactions WHERE type = ? AND category = ?')
      .get(type, name) as { n: number };
    return row.n;
  }

  countByPaymentMethod(name: string): number {
    const row = db
      .prepare('SELECT COUNT(*) AS n FROM transactions WHERE payment_method = ?')
      .get(name) as { n: number };
    return row.n;
  }
}

/** 单例仓库 */
export const transactionRepository = new TransactionRepository();
