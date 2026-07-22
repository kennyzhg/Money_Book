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

/** GET /api/v1/statistics/overview */
export function getOverview(_req: Request, res: Response): void {
  const data = statisticsService.overview();
  sendOk(res, data);
}
