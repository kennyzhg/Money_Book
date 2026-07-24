import { randomUUID } from 'crypto';
import type { FixedExpense, FixedExpenseInput } from '../../shared/types.js';
import { db } from '../data/db.js';

interface FixedExpenseRow {
  id: string;
  name: string;
  amount: number;
  category: string;
  payment_method: string;
  icon: string;
  enabled: number;
  start_month: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function rowToFixedExpense(row: FixedExpenseRow): FixedExpense {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    category: row.category,
    paymentMethod: row.payment_method,
    icon: row.icon,
    enabled: row.enabled === 1,
    startMonth: row.start_month,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class FixedExpenseRepository {
  list(): FixedExpense[] {
    const rows = db
      .prepare('SELECT * FROM fixed_expenses ORDER BY created_at DESC')
      .all() as FixedExpenseRow[];
    return rows.map(rowToFixedExpense);
  }

  /** 已启用且在目标月份生效的固定支出 */
  listEffective(month: string): FixedExpense[] {
    const rows = db
      .prepare(
        `SELECT * FROM fixed_expenses
         WHERE enabled = 1 AND start_month <= ?
         ORDER BY created_at DESC`,
      )
      .all(month) as FixedExpenseRow[];
    return rows.map(rowToFixedExpense);
  }

  findById(id: string): FixedExpense | undefined {
    const row = db
      .prepare('SELECT * FROM fixed_expenses WHERE id = ?')
      .get(id) as FixedExpenseRow | undefined;
    return row ? rowToFixedExpense(row) : undefined;
  }

  create(input: FixedExpenseInput): FixedExpense {
    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO fixed_expenses
        (id, name, amount, category, payment_method, icon, enabled, start_month, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.amount,
      input.category,
      input.paymentMethod,
      input.icon,
      input.enabled ? 1 : 0,
      input.startMonth,
      input.note ?? null,
      now,
      now,
    );
    return { ...input, id, createdAt: now, updatedAt: now };
  }

  update(id: string, patch: Partial<FixedExpenseInput>): FixedExpense | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;
    const merged: FixedExpense = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    db.prepare(
      `UPDATE fixed_expenses
       SET name = ?, amount = ?, category = ?, payment_method = ?, icon = ?,
           enabled = ?, start_month = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      merged.name,
      merged.amount,
      merged.category,
      merged.paymentMethod,
      merged.icon,
      merged.enabled ? 1 : 0,
      merged.startMonth,
      merged.note ?? null,
      merged.updatedAt,
      id,
    );
    return merged;
  }

  delete(id: string): boolean {
    const result = db.prepare('DELETE FROM fixed_expenses WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

export const fixedExpenseRepository = new FixedExpenseRepository();
