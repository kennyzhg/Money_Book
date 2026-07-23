/** 货币格式化：¥1,234.56 */
export function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 紧凑货币：¥1.2k / ¥1.3w（用于图表轴）
 *  - 支持负数（结余可能为负）
 *  - < 1000 的金额按原值显示（含小数），避免与正文 ¥1,234.56 风格割裂
 */
export function formatCompact(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs >= 10000) return `${sign}¥${(abs / 10000).toFixed(1)}w`;
  if (abs >= 1000) return `${sign}¥${(abs / 1000).toFixed(1)}k`;
  return `${sign}¥${abs % 1 === 0 ? abs : abs.toFixed(2)}`;
}

/** 当前月份 YYYY-MM */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 当前年份 YYYY */
export function currentYear(): string {
  return String(new Date().getFullYear());
}

/** 将 YYYY-MM 月份格式化为 "2026年7月" */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

/** 将 YYYY 年份格式化为 "2026年" */
export function formatYearLabel(year: string | number): string {
  return `${year}年`;
}

/**
 * 最近 count 年的年份列表（YYYY 字符串），按降序排列（当前年在最前）。
 * @param count 年数，默认 5
 */
export function getRecentYears(count = 5): string[] {
  const arr: string[] = [];
  const nowYear = new Date().getFullYear();
  for (let i = 0; i < count; i++) {
    arr.push(String(nowYear - i));
  }
  return arr;
}

/** 今日日期 YYYY-MM-DD */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * 最近 count 个月的月份列表（YYYY-MM），按降序排列（当前月在最前）。
 * @param count 月份数量，默认 12
 */
export function getRecentMonths(count = 12): string[] {
  const arr: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return arr;
}
