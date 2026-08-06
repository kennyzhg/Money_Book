import type { Request, Response } from 'express';
import type {
  TransactionInput,
  TransactionQuery,
  TransactionType,
  PaginatedTransactions,
} from '../../shared/types.js';
import { transactionService } from '../services/transactionService.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { sendOk, sendFail } from '../utils/response.js';

/**
 * 从 query string 提取整型数值；非法或缺失返回 undefined
 */
function parsePositiveInt(v: unknown): number | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const n = typeof v === 'string' ? parseInt(v, 10) : v;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

/**
 * GET /api/v1/transactions
 *
 * 支持参数：
 *  - month (YYYY-MM)：按月份过滤；优先于 year
 *  - year  (YYYY)：按整年过滤（month 缺省时生效）
 *  - type / paymentMethod / category：过滤
 *  - page / pageSize：分页参数。**若提供其中任意一个，则返回 PaginatedTransactions；
 *    若两者都缺失，则返回 Transaction[]（保持向后兼容，供 Dashboard / 统计调用方使用）**
 */
export function listTransactions(req: Request, res: Response): void {
  const page = parsePositiveInt(req.query.page);
  const pageSize = parsePositiveInt(req.query.pageSize);

  const query: TransactionQuery = {
    month: typeof req.query.month === 'string' ? req.query.month : undefined,
    year: typeof req.query.year === 'string' ? req.query.year : undefined,
    type: (req.query.type as TransactionType | undefined) ?? undefined,
    paymentMethod:
      typeof req.query.paymentMethod === 'string' ? req.query.paymentMethod : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    noteKeyword: typeof req.query.noteKeyword === 'string' ? req.query.noteKeyword : undefined,
    code: typeof req.query.code === 'string' ? req.query.code : undefined,
    page,
    pageSize,
  };

  // 分页模式：只要传了 page 或 pageSize 之一就走分页路径
  if (page !== undefined || pageSize !== undefined) {
    const data: PaginatedTransactions = transactionService.listPaginated(query);
    sendOk(res, data);
    return;
  }
  // 非分页模式：返回数组（向后兼容）
  const data = transactionService.list(query);
  sendOk(res, data);
}

/** GET /api/v1/transactions/:id
 *
 * :id 可以是内部 UUID，也可以是业务编号 code。
 * 判别规则：匹配 `{PM_CODE}-{14位时间戳}-{2位以上序号}` 视为 code 查询，否则按 UUID 处理。
 * 外部工具通过 `GET /transactions/ZFB-20260806123801-01` 即可稳定引用单条记录，
 * 无需关心内部 UUID 实现。序号段用 `\d{2,}` 兼容默认 2 位与溢出后的 3+ 位。
 */
export function getTransaction(req: Request, res: Response): void {
  const key = req.params.id;
  const isCode = /^[A-Za-z0-9]+-\d{14}-\d{2,}$/.test(key);
  const tx = isCode ? transactionService.getByCode(key) : transactionService.getById(key);
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
