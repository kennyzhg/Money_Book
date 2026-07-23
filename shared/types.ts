/**
 * 共享类型定义（前后端通用）
 * Agent-Friendly：结构稳定、自描述、可预测
 */

/** 交易类型 */
export type TransactionType = 'income' | 'expense';

/** 交易记录 */
export interface Transaction {
  id: string;
  /** 日期，格式 YYYY-MM-DD */
  date: string;
  /** 金额（正数，保留 2 位小数由后端归一化） */
  amount: number;
  /** 收入 / 支出 */
  type: TransactionType;
  /** 分类名称，例如 "餐饮" */
  category: string;
  /** 支付方式，例如 "支付宝" */
  paymentMethod: string;
  /** 备注，可选 */
  note?: string;
  /** 创建时间 ISO */
  createdAt: string;
  /** 更新时间 ISO */
  updatedAt: string;
}

/** 创建 / 更新交易时传入的负载 */
export type TransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

/** 列表查询参数 */
export interface TransactionQuery {
  /** 月份 YYYY-MM（优先级高于 year；若同时提供 month 和 year，仅按 month 过滤） */
  month?: string;
  /** 年份 YYYY（当不提供 month 时按整年过滤） */
  year?: string;
  /** 类型过滤 */
  type?: TransactionType;
  /** 支付方式过滤 */
  paymentMethod?: string;
  /** 分类过滤（可选，扩展用） */
  category?: string;
  /** 页码（从 1 开始，默认 1） */
  page?: number;
  /** 每页条数（默认 40） */
  pageSize?: number;
}

/** 分页返回结构（list 接口统一使用） */
export interface PaginatedTransactions {
  /** 当前页的记录 */
  items: Transaction[];
  /** 满足筛选条件的总记录数 */
  total: number;
  /** 当前页码（从 1 开始） */
  page: number;
  /** 每页条数 */
  pageSize: number;
}

/** 带图标的配置项 */
export interface IconItem {
  /** 显示名称 */
  name: string;
  /** lucide-react 图标名（kebab-case），如 "utensils" */
  icon: string;
}

/** 应用配置 */
export interface AppConfig {
  /** 分类（按收入/支出分组） */
  categories: {
    income: IconItem[];
    expense: IconItem[];
  };
  /** 支付方式 */
  paymentMethods: IconItem[];
}

/** 统计中的聚合项 */
export interface StatItem {
  name: string;
  value: number;
  icon: string;
}

/** 月度统计响应 */
export interface MonthlyStats {
  /** 月份 YYYY-MM */
  month: string;
  /** 总收入 */
  totalIncome: number;
  /** 总支出 */
  totalExpense: number;
  /** 结余 */
  balance: number;
  /** 按支出分类聚合 */
  expenseByCategory: StatItem[];
  /** 按支付方式聚合（仅支出） */
  expenseByPaymentMethod: StatItem[];
}

/** 单月概览 */
export interface MonthOverview {
  /** 月份 YYYY-MM */
  month: string;
  income: number;
  expense: number;
  balance: number;
}

/** 全年概览响应 */
export interface OverviewStats {
  /** 各月明细，按月份升序 */
  months: MonthOverview[];
  /** 全年总收入 */
  yearIncome: number;
  /** 全年总支出 */
  yearExpense: number;
  /** 全年结余 */
  yearBalance: number;
  /** 按支出分类聚合（年度） */
  expenseByCategory: StatItem[];
  /** 按支付方式聚合（年度，仅支出） */
  expenseByPaymentMethod: StatItem[];
}

/** 统一 API 响应格式 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}
