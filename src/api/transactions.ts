import type {
  Transaction,
  TransactionInput,
  TransactionQuery,
} from '@shared/types';
import { request } from './client';

export function fetchTransactions(params: TransactionQuery = {}): Promise<Transaction[]> {
  return request<Transaction[]>('/transactions', {
    method: 'GET',
    query: {
      month: params.month,
      type: params.type,
      paymentMethod: params.paymentMethod,
      category: params.category,
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
