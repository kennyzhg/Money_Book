import type { Request, Response } from 'express';
import { billService } from '../services/billService.js';
import { sendOk, sendFail } from '../utils/response.js';

class BillController {
  /** GET /api/v1/bills/budget-monthly?month=YYYY-MM —— 月度预算对比报表 */
  budgetMonthly(req: Request, res: Response): void {
    const month = typeof req.query.month === 'string' ? req.query.month : '';
    if (!/^\d{4}-\d{2}$/.test(month)) {
      sendFail(res, 'month 必须为 YYYY-MM 格式', 400);
      return;
    }
    sendOk(res, billService.monthlyReport(month));
  }

  /** GET /api/v1/bills/budget-yearly?year=YYYY —— 年度预算对比报表 */
  budgetYearly(req: Request, res: Response): void {
    const year = typeof req.query.year === 'string' ? req.query.year : '';
    if (!/^\d{4}$/.test(year)) {
      sendFail(res, 'year 必须为 YYYY 格式', 400);
      return;
    }
    sendOk(res, billService.yearlyReport(year));
  }

  /** GET /api/v1/bills/overview?month=YYYY-MM —— 账单总览（逐项对比） */
  overview(req: Request, res: Response): void {
    const month = typeof req.query.month === 'string' ? req.query.month : '';
    if (!/^\d{4}-\d{2}$/.test(month)) {
      sendFail(res, 'month 必须为 YYYY-MM 格式', 400);
      return;
    }
    sendOk(res, billService.billOverview(month));
  }
}

export const billController = new BillController();
