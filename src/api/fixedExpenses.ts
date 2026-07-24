import type { FixedExpense, FixedExpenseInput } from '@shared/types';
import { request } from './client';

export function fetchFixedExpenses(): Promise<FixedExpense[]> {
  return request<FixedExpense[]>('/fixed-expenses');
}

export function fetchFixedExpensesEffective(month: string): Promise<FixedExpense[]> {
  return request<FixedExpense[]>('/fixed-expenses', { method: 'GET', query: { month } });
}

export function createFixedExpense(input: FixedExpenseInput): Promise<FixedExpense> {
  return request<FixedExpense>('/fixed-expenses', { method: 'POST', body: input });
}

export function updateFixedExpense(
  id: string,
  patch: Partial<FixedExpenseInput>,
): Promise<FixedExpense> {
  return request<FixedExpense>(`/fixed-expenses/${id}`, { method: 'PUT', body: patch });
}

export function deleteFixedExpense(id: string): Promise<null> {
  return request<null>(`/fixed-expenses/${id}`, { method: 'DELETE' });
}
