import { randomUUID } from 'crypto';
import type {
  ShoppingPlan,
  ShoppingPlanInput,
  PlanStatus,
} from '../../shared/types.js';
import { db } from '../data/db.js';

interface ShoppingPlanRow {
  id: string;
  name: string;
  estimated_cost: number;
  priority: string;
  plan_month: string;
  category: string;
  payment_method: string;
  status: string;
  actual_cost: number | null;
  purchased_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function rowToShoppingPlan(row: ShoppingPlanRow): ShoppingPlan {
  return {
    id: row.id,
    name: row.name,
    estimatedCost: row.estimated_cost,
    priority: row.priority as ShoppingPlan['priority'],
    planMonth: row.plan_month,
    category: row.category,
    paymentMethod: row.payment_method,
    status: row.status as PlanStatus,
    actualCost: row.actual_cost ?? undefined,
    purchasedDate: row.purchased_date ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class ShoppingPlanRepository {
  list(): ShoppingPlan[] {
    const rows = db
      .prepare(
        `SELECT * FROM shopping_plans ORDER BY plan_month DESC, created_at DESC`,
      )
      .all() as ShoppingPlanRow[];
    return rows.map(rowToShoppingPlan);
  }

  /** 某月的未取消计划（用于预算聚合） */
  listByMonth(month: string): ShoppingPlan[] {
    const rows = db
      .prepare(
        `SELECT * FROM shopping_plans
         WHERE plan_month = ? AND status != 'cancelled'
         ORDER BY priority ASC, created_at DESC`,
      )
      .all(month) as ShoppingPlanRow[];
    return rows.map(rowToShoppingPlan);
  }

  findById(id: string): ShoppingPlan | undefined {
    const row = db
      .prepare('SELECT * FROM shopping_plans WHERE id = ?')
      .get(id) as ShoppingPlanRow | undefined;
    return row ? rowToShoppingPlan(row) : undefined;
  }

  create(input: ShoppingPlanInput): ShoppingPlan {
    const now = new Date().toISOString();
    const id = randomUUID();
    const status = input.status ?? 'planned';
    db.prepare(
      `INSERT INTO shopping_plans
        (id, name, estimated_cost, priority, plan_month, category, payment_method,
         status, actual_cost, purchased_date, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.estimatedCost,
      input.priority,
      input.planMonth,
      input.category,
      input.paymentMethod,
      status,
      input.actualCost ?? null,
      input.purchasedDate ?? null,
      input.note ?? null,
      now,
      now,
    );
    return {
      ...input,
      status,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  update(id: string, patch: Partial<ShoppingPlanInput>): ShoppingPlan | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;
    const merged: ShoppingPlan = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    db.prepare(
      `UPDATE shopping_plans
       SET name = ?, estimated_cost = ?, priority = ?, plan_month = ?, category = ?,
           payment_method = ?, status = ?, actual_cost = ?, purchased_date = ?,
           note = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      merged.name,
      merged.estimatedCost,
      merged.priority,
      merged.planMonth,
      merged.category,
      merged.paymentMethod,
      merged.status,
      merged.actualCost ?? null,
      merged.purchasedDate ?? null,
      merged.note ?? null,
      merged.updatedAt,
      id,
    );
    return merged;
  }

  delete(id: string): boolean {
    const result = db.prepare('DELETE FROM shopping_plans WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

export const shoppingPlanRepository = new ShoppingPlanRepository();
