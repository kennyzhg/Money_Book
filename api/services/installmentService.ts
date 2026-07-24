import type {
  Installment,
  InstallmentInput,
  InstallmentMethod,
} from '../../shared/types.js';
import { installmentRepository } from '../repositories/installmentRepository.js';
import { transactionRepository } from '../repositories/transactionRepository.js';
import { configRepository } from '../repositories/configRepository.js';
import { round2 } from '../utils/math.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

/**
 * 等额本息计算
 * - 每月还款额 = 本金 × 月利率 × (1+月利率)^期数 / ((1+月利率)^期数 - 1)
 * - 月利率 = 年利率 / 12 / 100
 */
function calcEqualPayment(
  principal: number,
  annualRate: number,
  termMonths: number,
): { monthlyPayment: number; totalInterest: number; totalPayment: number } {
  const r = annualRate / 100 / 12;
  if (r === 0) {
    // 零利率：每月还本金/期数
    const monthly = principal / termMonths;
    return {
      monthlyPayment: round2(monthly),
      totalInterest: 0,
      totalPayment: round2(principal),
    };
  }
  const pow = Math.pow(1 + r, termMonths);
  const monthly = (principal * r * pow) / (pow - 1);
  const totalPayment = monthly * termMonths;
  const totalInterest = totalPayment - principal;
  return {
    monthlyPayment: round2(monthly),
    totalInterest: round2(totalInterest),
    totalPayment: round2(totalPayment),
  };
}

/**
 * 等额本金��算
 * - 首月还款 = 本金/期数 + 本金 × 月利率（之后每月递减）
 * - 这里以首月还款额作为展示值，实际入账按每月等额（简化为月均还款额）
 */
function calcEqualPrincipal(
  principal: number,
  annualRate: number,
  termMonths: number,
): { monthlyPayment: number; totalInterest: number; totalPayment: number } {
  const r = annualRate / 100 / 12;
  const monthlyPrincipal = principal / termMonths;
  // 总利息 = (期数+1) × 本金 × 月利率 / 2
  const totalInterest = ((termMonths + 1) * principal * r) / 2;
  const totalPayment = principal + totalInterest;
  // 首月还款（展示用）
  const firstMonth = monthlyPrincipal + principal * r;
  return {
    monthlyPayment: round2(firstMonth),
    totalInterest: round2(totalInterest),
    totalPayment: round2(totalPayment),
  };
}

/** 根据还款方式计算，返回标准结果 */
export function calcInstallment(
  principal: number,
  annualRate: number,
  termMonths: number,
  method: InstallmentMethod,
): { monthlyPayment: number; totalInterest: number; totalPayment: number } {
  return method === 'equal_payment'
    ? calcEqualPayment(principal, annualRate, termMonths)
    : calcEqualPrincipal(principal, annualRate, termMonths);
}

function validateInput(input: Partial<InstallmentInput>): string | null {
  if (input.principal !== undefined && (input.principal <= 0 || !Number.isFinite(input.principal))) {
    return 'principal 必须大于 0';
  }
  if (input.annualRate !== undefined && (input.annualRate < 0 || !Number.isFinite(input.annualRate))) {
    return 'annualRate 不能为负';
  }
  if (input.termMonths !== undefined) {
    if (!Number.isInteger(input.termMonths) || input.termMonths <= 0) {
      return 'termMonths 必须为正整数';
    }
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

class InstallmentService {
  list(): Installment[] {
    return installmentRepository.list();
  }

  getById(id: string): Installment | undefined {
    return installmentRepository.findById(id);
  }

  create(input: InstallmentInput): Installment {
    if (!input.name?.trim()) throw new ValidationError('name 不能为空');
    if (!input.startMonth) throw new ValidationError('startMonth 不能为空');
    if (!input.category) throw new ValidationError('category 不能为空');
    if (!input.paymentMethod) throw new ValidationError('paymentMethod 不能为空');
    const err = validateInput(input);
    if (err) throw new ValidationError(err);

    const calc = calcInstallment(input.principal, input.annualRate, input.termMonths, input.method);
    return installmentRepository.create({ ...input, ...calc });
  }

  update(id: string, patch: Partial<InstallmentInput>): Installment {
    const existing = installmentRepository.findById(id);
    if (!existing) throw new NotFoundError('分期记录不存在');
    const err = validateInput(patch);
    if (err) throw new ValidationError(err);

    const merged: InstallmentInput = {
      name: patch.name ?? existing.name,
      kind: patch.kind ?? existing.kind,
      method: patch.method ?? existing.method,
      principal: patch.principal ?? existing.principal,
      annualRate: patch.annualRate ?? existing.annualRate,
      termMonths: patch.termMonths ?? existing.termMonths,
      startMonth: patch.startMonth ?? existing.startMonth,
      category: patch.category ?? existing.category,
      paymentMethod: patch.paymentMethod ?? existing.paymentMethod,
      status: patch.status ?? existing.status,
      note: patch.note ?? existing.note,
    };
    // 任一计算参数变化时重新计算
    const recalcNeeded =
      patch.principal !== undefined ||
      patch.annualRate !== undefined ||
      patch.termMonths !== undefined ||
      patch.method !== undefined;
    const calc = recalcNeeded
      ? calcInstallment(merged.principal, merged.annualRate, merged.termMonths, merged.method)
      : {
          monthlyPayment: existing.monthlyPayment,
          totalInterest: existing.totalInterest,
          totalPayment: existing.totalPayment,
        };
    return installmentRepository.update(id, { ...merged, ...calc }) as Installment;
  }

  delete(id: string): void {
    const ok = installmentRepository.delete(id);
    if (!ok) throw new NotFoundError('分期记录不存在');
  }

  /**
   * 将某个月的分期还款写入交易记录（自动计入当月支出）
   * - 对每个 active 且在该月还款周期内的分期生成一笔支出交易
   * - 日期固定为该月 15 号（避免月底/月初边界问题）
   * - 幂等：通过 note 中的 [installment:<id>:<month>] 标记避免重复
   */
  postMonthlyTransactions(month: string): { inserted: number; skipped: number } {
    const active = installmentRepository.listActiveByMonth(month);
    if (active.length === 0) return { inserted: 0, skipped: 0 };

    // 查询该月已存在的分期交易，避免重复入账
    const existing = transactionRepository.list({
      month,
      type: 'expense',
    });
    const tagSet = new Set(
      existing.map((t) => t.note ?? '').filter((n) => n.includes('[installment:')),
    );

    let inserted = 0;
    let skipped = 0;
    for (const inst of active) {
      const tag = `[installment:${inst.id}:${month}]`;
      if (tagSet.has(tag) || existing.some((t) => t.note?.includes(tag))) {
        skipped += 1;
        continue;
      }
      // 等额本息按每月还款额；等额本金简化为月均（总还款/期数）
      const monthlyAmount =
        inst.method === 'equal_payment'
          ? inst.monthlyPayment
          : round2(inst.totalPayment / inst.termMonths);
      transactionRepository.create({
        date: `${month}-15`,
        amount: monthlyAmount,
        type: 'expense',
        category: inst.category,
        paymentMethod: inst.paymentMethod,
        note: `${inst.name} · ${month} 还款 ${tag}`,
      });
      inserted += 1;
    }
    return { inserted, skipped };
  }
}

export const installmentService = new InstallmentService();
