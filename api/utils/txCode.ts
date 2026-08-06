/**
 * 交易业务编号（code）生成与解析
 *
 * 格式：`{支付方式代码}-{YYYYMMDDHHmmss}-{2位序号}`
 *   例如：`ZFB-20260806123801-01`
 *
 * 设计目标：
 *   1. 全局唯一：DB 唯一索引 + 同前缀+秒内序号递增保证
 *   2. 可读性：从编号本身能识别支付方式和大致创建时间
 *   3. 稳定性：编号一旦生成永不变更（update 不修改 code）
 *   4. 幂等性：相同支付方式名始终生成相同代码（避免大小写/unicode 问题）
 *   5. 溢出安全：序号默认 2 位（01-99），超过 99 自然扩展为 3 位（100、101...），
 *      不丢数据、不报错；唯一索引照常生效。
 *
 * 并发安全：SQLite better-sqlite3 是同步 API + 单写锁，串行执行 create，
 *   配合 generateCode 的 SELECT MAX 在同一同步调用栈里，不会出现并发冲突。
 */

/** 序号最小宽度：1-9 → "01"-"09"，10-99 → "10"-"99"，100+ → "100"（自然扩展，无截断） */
const SEQ_MIN_WIDTH = 2;

/** 中文支付方式名 → 拼音首字母代码的内置映射（覆盖初始 5 种 + 高频场景） */
const PM_CODE_MAP: Record<string, string> = {
  // 初始内置
  银行卡: 'YHK',
  支付宝: 'ZFB',
  微信: 'WX',
  抖音月付: 'DY',
  花呗: 'HB',
  // 常见扩展
  信用卡: 'XYK',
  现金: 'XJ',
  储值卡: 'CZK',
  公积金: 'GJJ',
  商务卡: 'SWK',
  ApplePay: 'AP',
  PayPal: 'PP',
};

/**
 * 把支付方式名映射为 2-4 位大写字母/数字代码
 *
 * 规则（按顺序）：
 *   1. 内置映射表精确命中 → 返回映射值
 *   2. 名称是纯 ASCII（英文）→ 取前 4 个字母大写
 *   3. 兜底：对每个字符取 char code 的 base36 编码，截前 4 位
 *      —— 确定性 + 紧凑，相同输入永远得到相同输出
 */
export function paymentMethodToCode(name: string): string {
  const trimmed = name.trim();
  if (PM_CODE_MAP[trimmed]) return PM_CODE_MAP[trimmed];

  if (/^[A-Za-z0-9]+$/.test(trimmed)) {
    return trimmed.toUpperCase().slice(0, 4);
  }

  let h = 0;
  for (let i = 0; i < trimmed.length; i++) {
    h = (h * 31 + trimmed.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(4, '0').slice(0, 4);
}

/** 把 Date 格式化为 YYYYMMDDHHmmss（本地时区，编号可读性优先） */
export function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** 把序号格式化为字符串：1→"01"，99→"99"，100→"100"（自然扩展） */
export function formatSeq(seq: number): string {
  return String(seq).padStart(SEQ_MIN_WIDTH, '0');
}

export interface ParsedTxCode {
  paymentMethodCode: string;
  /** 创建时间戳，YYYYMMDDHHmmss */
  timestamp: string;
  /** 同前缀内的序号，从 1 开始 */
  seq: number;
}

/**
 * 解析编号；非合法格式返回 null
 *
 * 序号段正则用 `\d{2,}`：兼容 2 位（01-99）与溢出后的 3+ 位（100+），
 * 而非定长 `\d{2}`，避免溢出编号被误判为非法。
 */
export function parseTxCode(code: string): ParsedTxCode | null {
  const m = /^([A-Z0-9]+)-(\d{14})-(\d{2,})$/.exec(code);
  if (!m) return null;
  return {
    paymentMethodCode: m[1],
    timestamp: m[2],
    seq: parseInt(m[3], 10),
  };
}

/**
 * 生成单条编号（无并发保护，仅用于一次性场景如 seed / 迁移脚本）。
 *
 * 生产路径请走 repository 内部带 SELECT MAX 的 generateCode，
 * 这里只是把"组装逻辑"独立出来便于测试。
 */
export function composeCode(paymentMethod: string, date: Date, seq: number): string {
  const pm = paymentMethodToCode(paymentMethod);
  const ts = formatTimestamp(date);
  return `${pm}-${ts}-${formatSeq(seq)}`;
}

