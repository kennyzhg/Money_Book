import type { Request, Response } from 'express';
import type { FixedExpenseInput } from '../../shared/types.js';
import { fixedExpenseService } from '../services/fixedExpenseService.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { sendOk, sendFail } from '../utils/response.js';

class FixedExpenseController {
  list(req: Request, res: Response): void {
    // 支持 ?month=YYYY-MM 只返回该月生效的
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    if (month) {
      sendOk(res, fixedExpenseService.listEffective(month));
      return;
    }
    sendOk(res, fixedExpenseService.list());
  }

  get(req: Request, res: Response): void {
    const item = fixedExpenseService.getById(req.params.id);
    if (!item) {
      sendFail(res, '固定支出不存在', 404);
      return;
    }
    sendOk(res, item);
  }

  create(req: Request, res: Response): void {
    try {
      const created = fixedExpenseService.create(req.body as FixedExpenseInput);
      sendOk(res, created, '创建成功', 201);
    } catch (e) {
      const status = e instanceof ValidationError ? 400 : 500;
      sendFail(res, e instanceof Error ? e.message : '创建失败', status);
    }
  }

  update(req: Request, res: Response): void {
    try {
      const updated = fixedExpenseService.update(req.params.id, req.body as Partial<FixedExpenseInput>);
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
      fixedExpenseService.delete(req.params.id);
      sendOk(res, null, '删除成功');
    } catch (e) {
      if (e instanceof NotFoundError) {
        sendFail(res, e.message, 404);
        return;
      }
      sendFail(res, e instanceof Error ? e.message : '删除失败', 500);
    }
  }
}

export const fixedExpenseController = new FixedExpenseController();
