import type {
  Transaction,
  TransactionInput,
  TransactionQuery,
  PaginatedTransactions,
} from '@shared/types';
import { request } from './client';

/**
 * 不分页查询：返回数组（向后兼容；Dashboard / 统计等调用方使用）
 *
 * 注意：此调用不会发送 page/pageSize 给后端，所以后端走"非分页"路径返回数组。
 */
export function fetchTransactions(params: TransactionQuery = {}): Promise<Transaction[]> {
  return request<Transaction[]>('/transactions', {
    method: 'GET',
    query: {
      month: params.month,
      year: params.year,
      type: params.type,
      paymentMethod: params.paymentMethod,
      category: params.category,
      noteKeyword: params.noteKeyword,
    },
  });
}

/**
 * 分页查询：返回 { items, total, page, pageSize }
 *
 * 内部强制带上 page/pageSize，触发后端的"分页路径"。
 */
export function fetchTransactionsPaginated(
  params: TransactionQuery = {},
): Promise<PaginatedTransactions> {
  return request<PaginatedTransactions>('/transactions', {
    method: 'GET',
    query: {
      month: params.month,
      year: params.year,
      type: params.type,
      paymentMethod: params.paymentMethod,
      category: params.category,
      noteKeyword: params.noteKeyword,
      page: params.page !== undefined ? String(params.page) : undefined,
      pageSize: params.pageSize !== undefined ? String(params.pageSize) : undefined,
    },
  });
}

export function createTransaction(input: TransactionInput): Promise<Transaction> {
  return request<Transaction>('/transactions', { method: 'POST', body: input });
}

export function updateTransaction(
  id: string,
  patch: Partial<TransactionInput>,
): Promise<Transaction> {
  return request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: patch });
}

export function deleteTransaction(id: string): Promise<null> {
  return request<null>(`/transactions/${id}`, { method: 'DELETE' });
}

/** 批量导入响应 */
export interface BatchImportResult {
  inserted: number;
  errors: Array<{ row: number; message: string }>;
}

/** 批量导入 */
export function batchCreateTransactions(
  transactions: TransactionInput[],
): Promise<BatchImportResult> {
  return request<BatchImportResult>('/transactions/batch', {
    method: 'POST',
    body: { transactions },
  });
}
