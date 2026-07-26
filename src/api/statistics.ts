import type { MonthlyStats, OverviewStats } from '@shared/types';
import { request } from './client';

export function fetchMonthlyStats(month: string): Promise<MonthlyStats> {
  return request<MonthlyStats>('/statistics/monthly', {
    method: 'GET',
    query: { month },
  });
}

export function fetchAvailableYears(): Promise<string[]> {
  return request<string[]>('/statistics/years', { method: 'GET' });
}

export function fetchOverview(year: string): Promise<OverviewStats> {
  return request<OverviewStats>('/statistics/overview', {
    method: 'GET',
    query: { year },
  });
}
