import type { ShoppingPlan, ShoppingPlanInput, PlanStatus } from '../../shared/types.js';
import { shoppingPlanRepository } from '../repositories/shoppingPlanRepository.js';
import { configRepository } from '../repositories/configRepository.js';
import { round2 } from '../utils/math.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

function validateInput(input: Partial<ShoppingPlanInput>): string | null {
  if (input.estimatedCost !== undefined && (input.estimatedCost <= 0 || !Number.isFinite(input.estimatedCost))) {
    return 'estimatedCost 必须大于 0';
  }
  if (input.planMonth !== undefined && !/^\d{4}-\d{2}$/.test(input.planMonth)) {
    return 'planMonth 必须为 YYYY-MM 格式';
  }
  if (input.priority !== undefined && !['high', 'medium', 'low'].includes(input.priority)) {
    return 'priority 只能是 high/medium/low';
  }
  if (input.category !== undefined) {
    const valid = new Set(configRepository.getCategories('expense').map((c) => c.name));
    if (!valid.has(input.category)) return `category "${input.category}" 不是有效的支出分类`;
  }
  if (input.paymentMethod !== undefined) {
    const valid = new Set(configRepository.getPaymentMethods().map((p) => p.name));
    if (!valid.has(input.paymentMethod)) return `paymentMethod "${input.paymentMethod}" 不是有效的支付方式`;
  }
  if (input.actualCost !== undefined && input.actualCost <= 0) {
    return 'actualCost 必须大于 0';
  }
  if (input.purchasedDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.purchasedDate)) {
    return 'purchasedDate 必须为 YYYY-MM-DD 格式';
  }
  return null;
}

class ShoppingPlanService {
  list(): ShoppingPlan[] {
    return shoppingPlanRepository.list();
  }

  /** 某月的未取消计划 */
  listByMonth(month: string): ShoppingPlan[] {
    return shoppingPlanRepository.listByMonth(month);
  }

  getById(id: string): ShoppingPlan | undefined {
    return shoppingPlanRepository.findById(id);
  }

  create(input: ShoppingPlanInput): ShoppingPlan {
    if (!input.name?.trim()) throw new ValidationError('name 不能为空');
    if (!input.planMonth) throw new ValidationError('planMonth 不能为空');
    if (!input.category) throw new ValidationError('category 不能为空');
    if (!input.paymentMethod) throw new ValidationError('paymentMethod 不能为空');
    if (input.priority === undefined) throw new ValidationError('priority 不能为空');
    const err = validateInput(input);
    if (err) throw new ValidationError(err);
    return shoppingPlanRepository.create({ ...input, estimatedCost: round2(input.estimatedCost) });
  }

  update(id: string, patch: Partial<ShoppingPlanInput>): ShoppingPlan {
    const existing = shoppingPlanRepository.findById(id);
    if (!existing) throw new NotFoundError('购物计划不存在');
    const err = validateInput(patch);
    if (err) throw new ValidationError(err);
    const merged: Partial<ShoppingPlanInput> = {
      ...patch,
      ...(patch.estimatedCost !== undefined ? { estimatedCost: round2(patch.estimatedCost) } : {}),
      ...(patch.actualCost !== undefined ? { actualCost: round2(patch.actualCost) } : {}),
    };
    return shoppingPlanRepository.update(id, merged) as ShoppingPlan;
  }

  /** 标记为已购买（自动回填状态与实际花费） */
  markPurchased(id: string, actualCost?: number, purchasedDate?: string): ShoppingPlan {
    const existing = shoppingPlanRepository.findById(id);
    if (!existing) throw new NotFoundError('购物计划不存在');
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return shoppingPlanRepository.update(id, {
      status: 'purchased' as PlanStatus,
      actualCost: actualCost !== undefined ? round2(actualCost) : existing.estimatedCost,
      purchasedDate: purchasedDate ?? todayStr,
    }) as ShoppingPlan;
  }

  delete(id: string): void {
    const ok = shoppingPlanRepository.delete(id);
    if (!ok) throw new NotFoundError('购物计划不存在');
  }
}

export const shoppingPlanService = new ShoppingPlanService();
