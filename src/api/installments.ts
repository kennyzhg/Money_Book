import type { Installment, InstallmentInput, InstallmentPostingIssue, InstallmentWithRemaining } from '@shared/types';
import { request } from './client';

export function fetchInstallments(): Promise<InstallmentWithRemaining[]> {
  return request<InstallmentWithRemaining[]>('/installments');
}

export function fetchInstallment(id: string): Promise<Installment> {
  return request<Installment>(`/installments/${id}`);
}

export function createInstallment(input: InstallmentInput): Promise<Installment> {
  return request<Installment>('/installments', { method: 'POST', body: input });
}

export function updateInstallment(
  id: string,
  patch: Partial<InstallmentInput>,
): Promise<Installment> {
  return request<Installment>(`/installments/${id}`, { method: 'PUT', body: patch });
}

export function deleteInstallment(id: string): Promise<null> {
  return request<null>(`/installments/${id}`, { method: 'DELETE' });
}

/** 仅计算分期，不入库 */
export function calcInstallmentApi(params: {
  principal: number;
  annualRate: number;
  termMonths: number;
  method: 'equal_payment' | 'equal_principal';
}): Promise<{ monthlyPayment: number; totalInterest: number; totalPayment: number }> {
  return request('/installments/calc', { method: 'POST', body: params });
}

/** 把某月所有进行中分期的应还款写入交易记录 */
export function postInstallmentsMonthly(
  month: string,
): Promise<{ inserted: number; skipped: number }> {
  return request('/installments/post-monthly', { method: 'POST', query: { month } });
}

export function fetchInstallmentIssues(): Promise<InstallmentPostingIssue[]> {
  return request<InstallmentPostingIssue[]>('/installments/issues');
}

export function postInstallmentEarly(id: string, paymentMethod: string): Promise<{ inserted: boolean }> {
  return request<{ inserted: boolean }>(`/installments/${id}/post-early`, { method: 'POST', body: { paymentMethod } });
}
