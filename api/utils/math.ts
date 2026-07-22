/**
 * 数学工具函数
 */

/** 保留两位小数，避免浮点误差 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
