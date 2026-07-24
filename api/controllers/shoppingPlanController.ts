import type { Request, Response } from 'express';
import type { ShoppingPlanInput } from '../../shared/types.js';
import { shoppingPlanService } from '../services/shoppingPlanService.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { sendOk, sendFail } from '../utils/response.js';

class ShoppingPlanController {
  list(req: Request, res: Response): void {
    // 支持 ?month=YYYY-MM 只返回该月计划
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    if (month) {
      sendOk(res, shoppingPlanService.listByMonth(month));
      return;
    }
    sendOk(res, shoppingPlanService.list());
  }

  get(req: Request, res: Response): void {
    const item = shoppingPlanService.getById(req.params.id);
    if (!item) {
      sendFail(res, '购物计划不存在', 404);
      return;
    }
    sendOk(res, item);
  }

  create(req: Request, res: Response): void {
    try {
      const created = shoppingPlanService.create(req.body as ShoppingPlanInput);
      sendOk(res, created, '创建成功', 201);
    } catch (e) {
      const status = e instanceof ValidationError ? 400 : 500;
      sendFail(res, e instanceof Error ? e.message : '创建失败', status);
    }
  }

  update(req: Request, res: Response): void {
    try {
      const updated = shoppingPlanService.update(req.params.id, req.body as Partial<ShoppingPlanInput>);
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

  /** PATCH /:id/purchase —— 标记为已购买，回填实际花费 */
  purchase(req: Request, res: Response): void {
    try {
      const { actualCost, purchasedDate } = (req.body ?? {}) as {
        actualCost?: number;
        purchasedDate?: string;
      };
      const updated = shoppingPlanService.markPurchased(req.params.id, actualCost, purchasedDate);
      sendOk(res, updated, '已标记为已购买');
    } catch (e) {
      if (e instanceof NotFoundError) {
        sendFail(res, e.message, 404);
        return;
      }
      const status = e instanceof ValidationError ? 400 : 500;
      sendFail(res, e instanceof Error ? e.message : '操作失败', status);
    }
  }

  delete(req: Request, res: Response): void {
    try {
      shoppingPlanService.delete(req.params.id);
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

export const shoppingPlanController = new ShoppingPlanController();
