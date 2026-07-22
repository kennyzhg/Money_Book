import type {
  Transaction,
  TransactionInput,
  TransactionQuery,
  TransactionType,
} from '../../shared/types.js';
import { transactionRepository } from '../repositories/transactionRepository.js';
import { configRepository } from '../repositories/configRepository.js';
import { round2 } from '../utils/math.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

/** 合法分类名集合（动态读取，反映管理员最新修改） */
function getValidCategoryNames(type?: TransactionType): Set<string> {
  const cfg = configRepository.getAll();
  if (type === 'income') return new Set(cfg.categories.income.map((c) => c.name));
  if (type === 'expense') return new Set(cfg.categories.expense.map((c) => c.name));
  // type 未知时（如 update 中只提供了 category），对两类并集做宽松校验
  return new Set([
    ...cfg.categories.income.map((c) => c.name),
    ...cfg.categories.expense.map((c) => c.name),
  ]);
}

/** 合法支付方式名集合（动态读取） */
function getValidPaymentMethodNames(): Set<string> {
  return new Set(configRepository.getPaymentMethods().map((p) => p.name));
}

/** 严格校验 YYYY-MM-DD 是否为真实有效日期（拒绝 2026-99-99、2026-02-30 等） */
function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // 用本地时间构造再回读，可识别"被自动进位"的伪日期（如 2 月 30 日 → 3 月 2 日）
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

/**
 * 校验交易输入，返回错误信息；通过返回 null
 *
 * `existing` 用于 update 场景：当 patch 只改了 type 或只改了 category 时，
 * 需要结合已存在记录来检查 type+category 配对是否仍合法。
 */
function validateInput(
  input: Partial<TransactionInput>,
  existing?: { type?: TransactionType; category?: string },
): string | null {
  // 日期：必须是真实存在的日期，而非仅格式匹配
  if (input.date !== undefined && !isValidDate(input.date)) {
    return 'date 必须为有效的 YYYY-MM-DD 日期';
  }
  // 金额：用 isFinite 拦截 NaN / Infinity / -Infinity
  if (input.amount !== undefined) {
    if (typeof input.amount !== 'number' || !Number.isFinite(input.amount)) {
      return 'amount 必须为有效数字';
    }
    if (input.amount <= 0) {
      return 'amount 必须大于 0';
    }
  }
  if (input.type !== undefined && input.type !== 'income' && input.type !== 'expense') {
    return 'type 只能是 income 或 expense';
  }
  if (
    input.paymentMethod !== undefined &&
    !getValidPaymentMethodNames().has(input.paymentMethod)
  ) {
    return `paymentMethod 不合法：${input.paymentMethod}`;
  }
  // 校验 type 与 category 的配对：按 effectiveType 对应的分类集合校验
  // 防止"收入 + 餐饮"这类错配写入
  const effectiveType = input.type ?? existing?.type;
  const effectiveCategory = input.category ?? existing?.category;
  if (effectiveType !== undefined && effectiveCategory !== undefined) {
    if (!getValidCategoryNames(effectiveType).has(effectiveCategory)) {
      return `category "${effectiveCategory}" 不属于 ${effectiveType} 类型`;
    }
  }
  return null;
}

/** 批量导入时的必填字段检查（validateInput 只校验已提供的字段） */
function checkRequiredFields(input: Partial<TransactionInput>): string | null {
  const missing: string[] = [];
  if (!input.date) missing.push('date');
  if (input.amount === undefined || input.amount === null) missing.push('amount');
  if (!input.type) missing.push('type');
  if (!input.category) missing.push('category');
  if (!input.paymentMethod) missing.push('paymentMethod');
  return missing.length > 0 ? `缺少必填字段: ${missing.join(', ')}` : null;
}

class TransactionService {
  list(query: TransactionQuery): Transaction[] {
    return transactionRepository.list(query);
  }

  getById(id: string): Transaction | undefined {
    return transactionRepository.findById(id);
  }

  create(input: TransactionInput): Transaction {
    const err = validateInput(input);
    if (err) throw new ValidationError(err);
    const normalized: TransactionInput = { ...input, amount: round2(input.amount) };
    return transactionRepository.create(normalized);
  }

  update(id: string, patch: Partial<TransactionInput>): Transaction {
    const existing = transactionRepository.findById(id);
    if (!existing) throw new NotFoundError('交易不存在');
    // 传入 existing 用于校验 type+category 配对
    // 场景：仅修改 type 时仍需验证旧 category 是否兼容新 type
    const err = validateInput(patch, {
      type: existing.type,
      category: existing.category,
    });
    if (err) throw new ValidationError(err);
    const merged: Partial<TransactionInput> = {
      ...patch,
      ...(patch.amount !== undefined ? { amount: round2(patch.amount) } : {}),
    };
    const updated = transactionRepository.update(id, merged);
    return updated as Transaction;
  }

  delete(id: string): void {
    const ok = transactionRepository.delete(id);
    if (!ok) throw new NotFoundError('交易不存在');
  }

  /** 供统计模块复用：按类型获取当月数据 */
  listByMonth(month: string, type?: TransactionType): Transaction[] {
    return transactionRepository.list({ month, type });
  }

  /**
   * 批量导入：逐条校验，跳过错误行，返回成功条数和错误明细
   */
  batchCreate(
    inputs: TransactionInput[],
  ): { inserted: number; errors: Array<{ row: number; message: string }> } {
    const errors: Array<{ row: number; message: string }> = [];
    let inserted = 0;

    inputs.forEach((input, idx) => {
      // 行号：CSV 第 1 行是表头，数据从第 2 行开始
      const row = idx + 2;
      // 先查必填字段（validateInput 只校验已提供的字段）
      const missingErr = checkRequiredFields(input);
      if (missingErr) {
        errors.push({ row, message: missingErr });
        return;
      }
      // 再查字段合法性
      const err = validateInput(input);
      if (err) {
        errors.push({ row, message: err });
        return;
      }
      try {
        const normalized: TransactionInput = { ...input, amount: round2(input.amount!) };
        transactionRepository.create(normalized);
        inserted += 1;
      } catch (e) {
        errors.push({
          row,
          message: e instanceof Error ? e.message : '插入失败',
        });
      }
    });

    return { inserted, errors };
  }
}

export const transactionService = new TransactionService();
