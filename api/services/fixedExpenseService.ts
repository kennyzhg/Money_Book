import type { FixedExpense, FixedExpenseInput } from '../../shared/types.js';
import { fixedExpenseRepository } from '../repositories/fixedExpenseRepository.js';
import { configRepository } from '../repositories/configRepository.js';
import { round2 } from '../utils/math.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

function validateInput(input: Partial<FixedExpenseInput>): string | null {
  if (input.amount !== undefined && (input.amount <= 0 || !Number.isFinite(input.amount))) {
    return 'amount 必须大于 0';
  }
  if (input.startMonth !== undefined && !/^\d{4}-\d{2}$/.test(input.startMonth)) {
    return 'startMonth 必须为 YYYY-MM 格式';
  }
  if (input.category !== undefined) {
    const valid = new Set(configRepository.getCategories('expense').map((c) => c.name));
    if (!valid.has(input.category)) return `category "${input.category}" 不是有效的支出分类`;
  }
  if (input.paymentMethod !== undefined) {
    const valid = new Set(configRepository.getPaymentMethods().map((p) => p.name));
    if (!valid.has(input.paymentMethod)) return `paymentMethod "${input.paymentMethod}" 不是有效的支付方式`;
  }
  return null;
}

class FixedExpenseService {
  list(): FixedExpense[] {
    return fixedExpenseRepository.list();
  }

  /** 当前月份生效的固定支出（用于预算聚合） */
  listEffective(month: string): FixedExpense[] {
    return fixedExpenseRepository.listEffective(month);
  }

  getById(id: string): FixedExpense | undefined {
    return fixedExpenseRepository.findById(id);
  }

  create(input: FixedExpenseInput): FixedExpense {
    if (!input.name?.trim()) throw new ValidationError('name 不能为空');
    if (!input.category) throw new ValidationError('category 不能为空');
    if (!input.paymentMethod) throw new ValidationError('paymentMethod 不能为空');
    if (!input.startMonth) throw new ValidationError('startMonth 不能为空');
    const err = validateInput(input);
    if (err) throw new ValidationError(err);
    return fixedExpenseRepository.create({ ...input, amount: round2(input.amount) });
  }

  update(id: string, patch: Partial<FixedExpenseInput>): FixedExpense {
    const existing = fixedExpenseRepository.findById(id);
    if (!existing) throw new NotFoundError('固定支出不存在');
    const err = validateInput(patch);
    if (err) throw new ValidationError(err);
    const merged: Partial<FixedExpenseInput> = {
      ...patch,
      ...(patch.amount !== undefined ? { amount: round2(patch.amount) } : {}),
    };
    return fixedExpenseRepository.update(id, merged) as FixedExpense;
  }

  delete(id: string): void {
    const ok = fixedExpenseRepository.delete(id);
    if (!ok) throw new NotFoundError('固定支出不存在');
  }
}

export const fixedExpenseService = new FixedExpenseService();
