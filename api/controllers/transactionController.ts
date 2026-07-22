import type { Request, Response } from 'express';
import type { TransactionInput, TransactionQuery, TransactionType } from '../../shared/types.js';
import { transactionService } from '../services/transactionService.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { sendOk, sendFail } from '../utils/response.js';

/** GET /api/v1/transactions?month=&type=&paymentMethod=&category= */
export function listTransactions(req: Request, res: Response): void {
  const query: TransactionQuery = {
    month: typeof req.query.month === 'string' ? req.query.month : undefined,
    type: (req.query.type as TransactionType | undefined) ?? undefined,
    paymentMethod: typeof req.query.paymentMethod === 'string' ? req.query.paymentMethod : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
  };
  const data = transactionService.list(query);
  sendOk(res, data);
}

/** GET /api/v1/transactions/:id */
export function getTransaction(req: Request, res: Response): void {
  const tx = transactionService.getById(req.params.id);
  if (!tx) {
    sendFail(res, '交易不存在', 404);
    return;
  }
  sendOk(res, tx);
}

/** POST /api/v1/transactions */
export function createTransaction(req: Request, res: Response): void {
  try {
    const input = req.body as TransactionInput;
    const created = transactionService.create(input);
    sendOk(res, created, '创建成功', 201);
  } catch (e) {
    const status = e instanceof ValidationError ? 400 : 500;
    sendFail(res, e instanceof Error ? e.message : '创建失败', status);
  }
}

/** PUT /api/v1/transactions/:id */
export function updateTransaction(req: Request, res: Response): void {
  try {
    const updated = transactionService.update(
      req.params.id,
      req.body as Partial<TransactionInput>,
    );
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

/** DELETE /api/v1/transactions/:id */
export function deleteTransaction(req: Request, res: Response): void {
  try {
    transactionService.delete(req.params.id);
    sendOk(res, null, '删除成功');
  } catch (e) {
    if (e instanceof NotFoundError) {
      sendFail(res, e.message, 404);
      return;
    }
    sendFail(res, e instanceof Error ? e.message : '删除失败', 500);
  }
}

/** POST /api/v1/transactions/batch */
export function batchCreateTransactions(req: Request, res: Response): void {
  try {
    const body = req.body as { transactions?: unknown };
    if (!body || !Array.isArray(body.transactions)) {
      sendFail(res, '请求体必须是 { transactions: [...] } 形式', 400);
      return;
    }
    if (body.transactions.length === 0) {
      sendFail(res, 'transactions 不能为空数组', 400);
      return;
    }
    if (body.transactions.length > 5000) {
      sendFail(res, '单次最多导入 5000 条', 400);
      return;
    }
    const result = transactionService.batchCreate(body.transactions as TransactionInput[]);
    sendOk(res, result, `成功导入 ${result.inserted} 条`);
  } catch (e) {
    sendFail(res, e instanceof Error ? e.message : '批量导入失败', 500);
  }
}
