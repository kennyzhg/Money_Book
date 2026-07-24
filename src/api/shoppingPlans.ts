import type { ShoppingPlan, ShoppingPlanInput } from '@shared/types';
import { request } from './client';

export function fetchShoppingPlans(): Promise<ShoppingPlan[]> {
  return request<ShoppingPlan[]>('/shopping-plans');
}

export function fetchShoppingPlansByMonth(month: string): Promise<ShoppingPlan[]> {
  return request<ShoppingPlan[]>('/shopping-plans', { method: 'GET', query: { month } });
}

export function createShoppingPlan(input: ShoppingPlanInput): Promise<ShoppingPlan> {
  return request<ShoppingPlan>('/shopping-plans', { method: 'POST', body: input });
}

export function updateShoppingPlan(
  id: string,
  patch: Partial<ShoppingPlanInput>,
): Promise<ShoppingPlan> {
  return request<ShoppingPlan>(`/shopping-plans/${id}`, { method: 'PUT', body: patch });
}

/** 标记为已购买 */
export function markPlanPurchased(
  id: string,
  body: { actualCost?: number; purchasedDate?: string },
): Promise<ShoppingPlan> {
  return request<ShoppingPlan>(`/shopping-plans/${id}/purchase`, { method: 'PATCH', body });
}

export function deleteShoppingPlan(id: string): Promise<null> {
  return request<null>(`/shopping-plans/${id}`, { method: 'DELETE' });
}
