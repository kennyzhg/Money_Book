/**
 * 共享类型定义（前后端通用）
 * Agent-Friendly：结构稳定、自描述、可预测
 */

/** 交易类型 */
export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  /**
   * 业务编号：全局唯一、创建时自动生成、创建后不可修改。
   * 格式：`{支付方式代码}-{YYYYMMDDHHmmss}-{2位序号}`，如 `ZFB-20260806123801-01`
   * 序号默认 2 位（01-99），同秒内超过 99 条时自然扩展为 3 位（100+），不丢数据。
   * 供外部工具作为稳定标识符引用，与内部 id（UUID，可能换库变化）解耦。
   */
  code: string;
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

/**
 * 创建 / 更新交易时传入的负载
 *
 * 注意：code 是服务端自动生成的，输入负载里排除；
 * 即便客户端在 patch 里塞了 code，service 层也会忽略（不可修改）。
 */
export type TransactionInput = Omit<Transaction, 'id' | 'code' | 'createdAt' | 'updatedAt'>;

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
  /** 备注关键词：按包含关系匹配 */
  noteKeyword?: string;
  /**
   * 业务编号精确过滤：与 list 中其他筛选条件 AND 组合。
   * 例如 `?code=ZFB-20260806123801-01` 只返回该编号对应的单条记录。
   */
  code?: string;
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
  /** 所有筛选命中记录的收支汇总 */
  summary: {
    totalIncome: number;
    totalExpense: number;
    balance: number;
  };
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

// ====================================================================
// 财务规划模块（分期 / 固定支出 / 购物计划 / 预算 / 账单）
// ====================================================================

/** 分期类型：车贷、房贷、电子产品等 */
export type InstallmentKind = 'car' | 'house' | 'electronics' | 'other';

/** 还款方式 */
export type InstallmentMethod = 'equal_payment' | 'equal_principal';
// equal_payment  = 等额本息（每月还款额相同）
// equal_principal = 等额本金（每月本金相同，利息递减）

/** 分期状态 */
export type InstallmentStatus = 'active' | 'paid_off' | 'cancelled';

/** 分期记录 */
export interface Installment {
  id: string;
  /** 名称，例如 "车贷-比亚迪汉" */
  name: string;
  /** 分期类型 */
  kind: InstallmentKind;
  /** 还款方式 */
  method: InstallmentMethod;
  /** 本金（元） */
  principal: number;
  /** 年利率（百分数，如 4.75 表示 4.75%） */
  annualRate: number;
  /** 期数（月） */
  termMonths: number;
  /** 起始月份 YYYY-MM（第一期还款月） */
  startMonth: string;
  /** 关联的分类名称（写入交易时使用，必须为支出分类） */
  category: string;
  /** 关联的支付方式名称 */
  paymentMethod: string;
  /** 每月还款额（等额本息时为固定值；等额本金时为首月，仅作展示） */
  monthlyPayment: number;
  /** 总利息 */
  totalInterest: number;
  /** 总还款额 */
  totalPayment: number;
  /** 状态 */
  status: InstallmentStatus;
  /** 备注 */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** 创建/更新分期时传入的负载 */
export type InstallmentInput = Omit<
  Installment,
  | 'id'
  | 'monthlyPayment'
  | 'totalInterest'
  | 'totalPayment'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
> & {
  /** 创建时可显式指定状态（默认 active） */
  status?: InstallmentStatus;
};

/** 固定支出记录（每月可预见的固定开销） */
export interface FixedExpense {
  id: string;
  /** 名称，例如 "网费" */
  name: string;
  /** 金额（元/月） */
  amount: number;
  /** 关联分类（支出） */
  category: string;
  /** 关联支付方式 */
  paymentMethod: string;
  /** 图标（lucide 名） */
  icon: string;
  /** 启用状态：true 才计入预算 */
  enabled: boolean;
  /** 生效起始月份 YYYY-MM（默认当前月） */
  startMonth: string;
  /** 备注 */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type FixedExpenseInput = Omit<FixedExpense, 'id' | 'createdAt' | 'updatedAt'>;

/** 购物计划优先级 */
export type PlanPriority = 'high' | 'medium' | 'low';

/** 购物计划状态 */
export type PlanStatus = 'planned' | 'purchased' | 'cancelled';

/** 购物计划记录 */
export interface ShoppingPlan {
  id: string;
  /** 物品名称 */
  name: string;
  /** 预计花费 */
  estimatedCost: number;
  /** 优先级 */
  priority: PlanPriority;
  /** 计划购买月份 YYYY-MM（下月或指定月） */
  planMonth: string;
  /** 关联分类（支出） */
  category: string;
  /** 关联支付方式 */
  paymentMethod: string;
  /** 状态 */
  status: PlanStatus;
  /** 实际花费（购买后回填） */
  actualCost?: number;
  /** 实际购买日期 YYYY-MM-DD */
  purchasedDate?: string;
  /** 备注 */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type ShoppingPlanInput = Omit<
  ShoppingPlan,
  'id' | 'status' | 'createdAt' | 'updatedAt'
> & {
  status?: PlanStatus;
};

// ====================================================================
// 预算对比报表 & 账单总览
// ====================================================================

/** 预计支出明细项（账单总览中的一行） */
export interface ProjectedItem {
  /** 来源类型 */
  source: 'fixed' | 'installment' | 'plan';
  /** 来源记录 id */
  refId: string;
  /** 名称 */
  name: string;
  /** 分类 */
  category: string;
  /** 支付方式 */
  paymentMethod: string;
  /** 预计金额 */
  amount: number;
  /** 图标 */
  icon: string;
  /** 原始优先级（仅购物计划有意义） */
  priority?: PlanPriority;
}

/** 实际支出明细项（聚合自 transactions，按 category 分组） */
export interface ActualItem {
  /** 分类名 */
  category: string;
  /** 图标 */
  icon: string;
  /** 实际支出金额 */
  amount: number;
  /** 包含的笔数 */
  count: number;
}

/** 预算对比报表 —— 单月 */
export interface MonthlyBudgetReport {
  /** 月份 YYYY-MM */
  month: string;
  /** 预计支出总额（固定支出 + 分期 + 购物计划） */
  projectedExpense: number;
  /** 实际支出总额 */
  actualExpense: number;
  /** 差额（actual - projected；正数=超支，负数=节省） */
  diff: number;
  /** 预计明细 */
  projectedItems: ProjectedItem[];
  /** 实际明细（按分类聚合） */
  actualItems: ActualItem[];
}

/** 预算对比报表 —— 年度 */
export interface YearlyBudgetReport {
  /** 年份 YYYY */
  year: string;
  /** 全年预计支出 */
  projectedExpense: number;
  /** 全年实际支出 */
  actualExpense: number;
  /** 差额 */
  diff: number;
  /** 各月明细 */
  months: Array<{
    month: string;
    projectedExpense: number;
    actualExpense: number;
    diff: number;
  }>;
}

/** 账单总览（某月预计账单 vs 实际已支出账单的逐项对比） */
export interface BillOverview {
  /** 月份 YYYY-MM */
  month: string;
  /** 预计总额 */
  projectedTotal: number;
  /** 实际总额 */
  actualTotal: number;
  /** 差额（正=超支，负=节省） */
  diff: number;
  /** 逐项对比 */
  items: Array<{
    /** 名称 */
    name: string;
    /** 分类 */
    category: string;
    /** 预计金额 */
    projected: number;
    /** 实际金额 */
    actual: number;
    /** 差额 */
    diff: number;
    /** 来源类型 */
    source: ProjectedItem['source'];
    /** 图标 */
    icon: string;
  }>;
}
