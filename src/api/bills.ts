import type { MonthlyBudgetReport, YearlyBudgetReport, BillOverview } from '@shared/types';
import { request } from './client';

/** 月度预算对比报表 */
export function fetchBudgetMonthly(month: string): Promise<MonthlyBudgetReport> {
  return request<MonthlyBudgetReport>('/bills/budget-monthly', { method: 'GET', query: { month } });
}

/** 年度预算对比报表 */
export function fetchBudgetYearly(year: string): Promise<YearlyBudgetReport> {
  return request<YearlyBudgetReport>('/bills/budget-yearly', { method: 'GET', query: { year } });
}

/** 账单总览（逐项对比） */
export function fetchBillOverview(month: string): Promise<BillOverview> {
  return request<BillOverview>('/bills/overview', { method: 'GET', query: { month } });
}
