import type { Response } from 'express';
import type { ApiResponse } from '../../shared/types.js';

/** 统一的成功响应 */
export function sendOk<T>(res: Response, data: T, message = 'ok', status = 200): void {
  const body: ApiResponse<T> = { success: true, data, message };
  res.status(status).json(body);
}

/** 统一的失败响应 */
export function sendFail(res: Response, message: string, status = 400): void {
  const body: ApiResponse<null> = { success: false, data: null, message };
  res.status(status).json(body);
}
