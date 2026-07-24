import type { Request, Response } from 'express';
import type { InstallmentInput } from '../../shared/types.js';
import { installmentService } from '../services/installmentService.js';
import { calcInstallment } from '../services/installmentService.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { sendOk, sendFail } from '../utils/response.js';

class InstallmentController {
  list(_req: Request, res: Response): void {
    sendOk(res, installmentService.list());
  }

  get(req: Request, res: Response): void {
    const item = installmentService.getById(req.params.id);
    if (!item) {
      sendFail(res, '分期记录不存在', 404);
      return;
    }
    sendOk(res, item);
  }

  create(req: Request, res: Response): void {
    try {
      const created = installmentService.create(req.body as InstallmentInput);
      sendOk(res, created, '创建成功', 201);
    } catch (e) {
      const status = e instanceof ValidationError ? 400 : 500;
      sendFail(res, e instanceof Error ? e.message : '创建失败', status);
    }
  }

  update(req: Request, res: Response): void {
    try {
      const updated = installmentService.update(req.params.id, req.body as Partial<InstallmentInput>);
      sendOk(res, updated, '更新成功');
    } catch (e) {
      if (e instanceof NotFoundError) {
        sendFail(res, e.message, 404);
        return;
      }
      const status = e instanceof ValidationError ? 400 : 500;
      sendFail(res, e instanceof Error ? e.message : '更新失败', status);
    }
  }

  delete(req: Request, res: Response): void {
    try {
      installmentService.delete(req.params.id);
      sendOk(res, null, '删除成功');
    } catch (e) {
      if (e instanceof NotFoundError) {
        sendFail(res, e.message, 404);
        return;
      }
      sendFail(res, e instanceof Error ? e.message : '删除失败', 500);
    }
  }

  /**
   * POST /api/v1/installments/calc
   * 仅计算，不入库。返回 { monthlyPayment, totalInterest, totalPayment }
   */
  calc(req: Request, res: Response): void {
    try {
      const { principal, annualRate, termMonths, method } = req.body as {
        principal: number;
        annualRate: number;
        termMonths: number;
        method: 'equal_payment' | 'equal_principal';
      };
      if (typeof principal !== 'number' || principal <= 0) {
        sendFail(res, 'principal 必须大于 0', 400);
        return;
      }
      if (typeof annualRate !== 'number' || annualRate < 0) {
        sendFail(res, 'annualRate 不能为负', 400);
        return;
      }
      if (!Number.isInteger(termMonths) || termMonths <= 0) {
        sendFail(res, 'termMonths 必须为正整数', 400);
        return;
      }
      if (method !== 'equal_payment' && method !== 'equal_principal') {
        sendFail(res, 'method 只能是 equal_payment 或 equal_principal', 400);
        return;
      }
      const result = calcInstallment(principal, annualRate, termMonths, method);
      sendOk(res, result);
    } catch (e) {
      sendFail(res, e instanceof Error ? e.message : '计算失败', 500);
    }
  }

  /**
   * POST /api/v1/installments/post-monthly?month=YYYY-MM
   * 把当月所有进行中分期的应还款写入交易记录（自动计入支出）
   */
  postMonthly(req: Request, res: Response): void {
    try {
      const month = typeof req.query.month === 'string' ? req.query.month : '';
      if (!/^\d{4}-\d{2}$/.test(month)) {
        sendFail(res, 'month 必须为 YYYY-MM 格式', 400);
        return;
      }
      const result = installmentService.postMonthlyTransactions(month);
      sendOk(res, result, `入账 ${result.inserted} 笔，跳过 ${result.skipped} 笔`);
    } catch (e) {
      sendFail(res, e instanceof Error ? e.message : '入账失败', 500);
    }
  }
}

export const installmentController = new InstallmentController();
