import type { Request, Response } from 'express';
import type { IconItem, TransactionType } from '../../shared/types.js';
import { configService } from '../services/configService.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { sendOk, sendFail } from '../utils/response.js';

/** GET /api/v1/config */
export function getConfig(_req: Request, res: Response): void {
  sendOk(res, configService.getAll());
}

/** POST /api/v1/config/categories  body: { type, name, icon } */
export function addCategory(req: Request, res: Response): void {
  try {
    const { type } = req.body as { type: TransactionType };
    if (type !== 'income' && type !== 'expense') {
      sendFail(res, 'type 必须为 income 或 expense', 400);
      return;
    }
    const item = req.body as IconItem;
    const created = configService.addCategory(type, item);
    sendOk(res, created, '创建成功', 201);
  } catch (e) {
    const status = e instanceof ValidationError ? 400 : 500;
    sendFail(res, e instanceof Error ? e.message : '创建失败', status);
  }
}

/** DELETE /api/v1/config/categories/:type/:name */
export function removeCategory(req: Request, res: Response): void {
  try {
    const { type } = req.params as { type: TransactionType };
    if (type !== 'income' && type !== 'expense') {
      sendFail(res, 'type 必须为 income 或 expense', 400);
      return;
    }
    const name = decodeURIComponent(req.params.name);
    configService.removeCategory(type, name);
    sendOk(res, null, '删除成功');
  } catch (e) {
    if (e instanceof NotFoundError) {
      sendFail(res, e.message, 404);
      return;
    }
    sendFail(res, e instanceof Error ? e.message : '删除失败', 500);
  }
}

/** POST /api/v1/config/payment-methods  body: { name, icon } */
export function addPaymentMethod(req: Request, res: Response): void {
  try {
    const item = req.body as IconItem;
    const created = configService.addPaymentMethod(item);
    sendOk(res, created, '创建成功', 201);
  } catch (e) {
    const status = e instanceof ValidationError ? 400 : 500;
    sendFail(res, e instanceof Error ? e.message : '创建失败', status);
  }
}

/** DELETE /api/v1/config/payment-methods/:name */
export function removePaymentMethod(req: Request, res: Response): void {
  try {
    const name = decodeURIComponent(req.params.name);
    configService.removePaymentMethod(name);
    sendOk(res, null, '删除成功');
  } catch (e) {
    if (e instanceof NotFoundError) {
      sendFail(res, e.message, 404);
      return;
    }
    sendFail(res, e instanceof Error ? e.message : '删除失败', 500);
  }
}
