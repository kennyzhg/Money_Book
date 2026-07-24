import { randomUUID } from 'crypto';
import type {
  Installment,
  InstallmentInput,
  InstallmentStatus,
} from '../../shared/types.js';
import { db } from '../data/db.js';

interface InstallmentRow {
  id: string;
  name: string;
  kind: string;
  method: string;
  principal: number;
  annual_rate: number;
  term_months: number;
  start_month: string;
  category: string;
  payment_method: string;
  monthly_payment: number;
  total_interest: number;
  total_payment: number;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function rowToInstallment(row: InstallmentRow): Installment {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as Installment['kind'],
    method: row.method as Installment['method'],
    principal: row.principal,
    annualRate: row.annual_rate,
    termMonths: row.term_months,
    startMonth: row.start_month,
    category: row.category,
    paymentMethod: row.payment_method,
    monthlyPayment: row.monthly_payment,
    totalInterest: row.total_interest,
    totalPayment: row.total_payment,
    status: row.status as InstallmentStatus,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class InstallmentRepository {
  list(): Installment[] {
    const rows = db
      .prepare('SELECT * FROM installments ORDER BY created_at DESC')
      .all() as InstallmentRow[];
    return rows.map(rowToInstallment);
  }

  /** 仅查询进行中的分期（用于预算/账单聚合） */
  listActiveByMonth(month: string): Installment[] {
    // 该月是否处于还款周期内：startMonth <= month < startMonth + termMonths
    const rows = db
      .prepare(
        `SELECT * FROM installments
         WHERE status = 'active'
           AND start_month <= ?
           AND date(start_month, '+' || term_months || ' months') > ?`,
      )
      .all(month, month) as InstallmentRow[];
    return rows.map(rowToInstallment);
  }

  findById(id: string): Installment | undefined {
    const row = db
      .prepare('SELECT * FROM installments WHERE id = ?')
      .get(id) as InstallmentRow | undefined;
    return row ? rowToInstallment(row) : undefined;
  }

  create(
    input: InstallmentInput & {
      monthlyPayment: number;
      totalInterest: number;
      totalPayment: number;
    },
  ): Installment {
    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO installments
        (id, name, kind, method, principal, annual_rate, term_months, start_month,
         category, payment_method, monthly_payment, total_interest, total_payment,
         status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.kind,
      input.method,
      input.principal,
      input.annualRate,
      input.termMonths,
      input.startMonth,
      input.category,
      input.paymentMethod,
      input.monthlyPayment,
      input.totalInterest,
      input.totalPayment,
      input.status ?? 'active',
      input.note ?? null,
      now,
      now,
    );
    return {
      ...input,
      monthlyPayment: input.monthlyPayment,
      totalInterest: input.totalInterest,
      totalPayment: input.totalPayment,
      status: input.status ?? 'active',
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  update(
    id: string,
    patch: Partial<InstallmentInput> & {
      monthlyPayment?: number;
      totalInterest?: number;
      totalPayment?: number;
      status?: InstallmentStatus;
    },
  ): Installment | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;
    const merged: Installment = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    db.prepare(
      `UPDATE installments
       SET name = ?, kind = ?, method = ?, principal = ?, annual_rate = ?,
           term_months = ?, start_month = ?, category = ?, payment_method = ?,
           monthly_payment = ?, total_interest = ?, total_payment = ?,
           status = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      merged.name,
      merged.kind,
      merged.method,
      merged.principal,
      merged.annualRate,
      merged.termMonths,
      merged.startMonth,
      merged.category,
      merged.paymentMethod,
      merged.monthlyPayment,
      merged.totalInterest,
      merged.totalPayment,
      merged.status,
      merged.note ?? null,
      merged.updatedAt,
      id,
    );
    return merged;
  }

  delete(id: string): boolean {
    const result = db.prepare('DELETE FROM installments WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

export const installmentRepository = new InstallmentRepository();
