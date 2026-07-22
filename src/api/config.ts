import type {
  AppConfig,
  IconItem,
  TransactionType,
} from '@shared/types';
import { request } from './client';

export function fetchConfig(): Promise<AppConfig> {
  return request<AppConfig>('/config', { method: 'GET' });
}

/** 添加分类 */
export function addCategory(
  type: TransactionType,
  item: IconItem,
): Promise<IconItem> {
  return request<IconItem>('/config/categories', {
    method: 'POST',
    body: { type, ...item },
  });
}

/** 删除分类 */
export function removeCategory(type: TransactionType, name: string): Promise<null> {
  return request<null>(
    `/config/categories/${type}/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  );
}

/** 添加支付方式 */
export function addPaymentMethod(item: IconItem): Promise<IconItem> {
  return request<IconItem>('/config/payment-methods', {
    method: 'POST',
    body: item,
  });
}

/** 删除支付方式 */
export function removePaymentMethod(name: string): Promise<null> {
  return request<null>(
    `/config/payment-methods/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  );
}
