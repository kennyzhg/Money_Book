import type { MonthlyStats, OverviewStats } from '@shared/types';
import { request } from './client';

export function fetchMonthlyStats(month: string): Promise<MonthlyStats> {
  return request<MonthlyStats>('/statistics/monthly', {
    method: 'GET',
    query: { month },
  });
}

export function fetchOverview(): Promise<OverviewStats> {
  return request<OverviewStats>('/statistics/overview', { method: 'GET' });
}
