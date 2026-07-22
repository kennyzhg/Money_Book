import type { IconItem, TransactionType } from '../../shared/types.js';
import { configRepository } from '../repositories/configRepository.js';
import { transactionRepository } from '../repositories/transactionRepository.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

/** 校验配置项 */
function validateItem(item: Partial<IconItem>): void {
  if (!item.name || typeof item.name !== 'string' || !item.name.trim()) {
    throw new ValidationError('name 不能为空');
  }
  if (item.name.length > 20) {
    throw new ValidationError('name 长度不能超过 20');
  }
  if (!item.icon || typeof item.icon !== 'string' || !item.icon.trim()) {
    throw new ValidationError('icon 不能为空');
  }
}

class ConfigService {
  getAll() {
    return configRepository.getAll();
  }

  addCategory(type: TransactionType, item: IconItem): IconItem {
    validateItem(item);
    const normalized: IconItem = { name: item.name.trim(), icon: item.icon.trim() };
    const ok = configRepository.addCategory(type, normalized);
    if (!ok) throw new ValidationError(`分类已存在：${normalized.name}`);
    return normalized;
  }

  removeCategory(type: TransactionType, name: string): void {
    // 删除前检查是否被交易引用，防止历史交易在后续更新时校验失败
    const count = transactionRepository.countByCategory(type, name);
    if (count > 0) {
      throw new ValidationError(
        `分类已被 ${count} 条交易引用，无法删除。请先迁移或删除相关交易。`,
      );
    }
    const ok = configRepository.removeCategory(type, name);
    if (!ok) throw new NotFoundError(`分类不存在：${name}`);
  }

  addPaymentMethod(item: IconItem): IconItem {
    validateItem(item);
    const normalized: IconItem = { name: item.name.trim(), icon: item.icon.trim() };
    const ok = configRepository.addPaymentMethod(normalized);
    if (!ok) throw new ValidationError(`支付方式已存在：${normalized.name}`);
    return normalized;
  }

  removePaymentMethod(name: string): void {
    // 删除前检查是否被交易引用，防止历史交易在后续更新时校验失败
    const count = transactionRepository.countByPaymentMethod(name);
    if (count > 0) {
      throw new ValidationError(
        `支付方式已被 ${count} 条交易引用，无法删除。请先迁移或删除相关交易。`,
      );
    }
    const ok = configRepository.removePaymentMethod(name);
    if (!ok) throw new NotFoundError(`支付方式不存在：${name}`);
  }
}

export const configService = new ConfigService();
