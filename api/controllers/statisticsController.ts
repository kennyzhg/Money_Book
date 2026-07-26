import type { Request, Response } from 'express';
import { statisticsService } from '../services/statisticsService.js';
import { sendOk, sendFail } from '../utils/response.js';

/** GET /api/v1/statistics/monthly?month=YYYY-MM */
export function getMonthly(req: Request, res: Response): void {
  const month = typeof req.query.month === 'string' ? req.query.month : '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    sendFail(res, 'month 参数必须为 YYYY-MM 格式，例如 2026-07', 400);
    return;
  }
  const data = statisticsService.monthly(month);
  sendOk(res, data);
}

/** GET /api/v1/statistics/years */
export function getAvailableYears(_req: Request, res: Response): void {
  sendOk(res, statisticsService.availableYears());
}

/** GET /api/v1/statistics/overview?year=YYYY */
export function getOverview(req: Request, res: Response): void {
  const year = typeof req.query.year === 'string' ? req.query.year : '';
  if (!/^\d{4}$/.test(year)) {
    sendFail(res, 'year 参数必须为 YYYY 格式，例如 2026', 400);
    return;
  }
  const data = statisticsService.overview(year);
  sendOk(res, data);
}
