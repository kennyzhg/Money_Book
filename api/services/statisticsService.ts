import type {
  AppConfig,
  MonthlyStats,
  OverviewStats,
  StatItem,
  Transaction,
} from '../../shared/types.js';
import { transactionService } from './transactionService.js';
import { configRepository } from '../repositories/configRepository.js';
import {
  buildCategoryIconMap,
  buildPaymentMethodIconMap,
} from '../config/appConfig.js';
import { round2 } from '../utils/math.js';

/** 按维度聚合支出（图标映射动态读取最新配置） */
function aggregate(
  items: Transaction[],
  iconMap: Record<string, string>,
  key: 'category' | 'paymentMethod',
): StatItem[] {
  const totals = new Map<string, number>();
  for (const t of items) {
    const k = t[key];
    totals.set(k, (totals.get(k) ?? 0) + t.amount);
  }
  return Array.from(totals.entries())
    .map(([name, value]) => ({ name, value: round2(value), icon: iconMap[name] ?? 'circle' }))
    .sort((a, b) => b.value - a.value);
}

class StatisticsService {
  /** 月度统计 */
  monthly(month: string): MonthlyStats {
    const all = transactionService.listByMonth(month);
    const cfg = configRepository.getAll();
    return this.buildMonthlyStats(month, all, cfg);
  }

  /** 根据已查到的交易列表构建月度统计（避免重复查询数据库） */
  private buildMonthlyStats(
    month: string,
    all: Transaction[],
    cfg: AppConfig,
  ): MonthlyStats {
    const income = all.filter((t) => t.type === 'income');
    const expense = all.filter((t) => t.type === 'expense');

    const totalIncome = round2(income.reduce((s, t) => s + t.amount, 0));
    const totalExpense = round2(expense.reduce((s, t) => s + t.amount, 0));

    return {
      month,
      totalIncome,
      totalExpense,
      balance: round2(totalIncome - totalExpense),
      expenseByCategory: aggregate(expense, buildCategoryIconMap(cfg), 'category'),
      expenseByPaymentMethod: aggregate(expense, buildPaymentMethodIconMap(cfg), 'paymentMethod'),
    };
  }

  /** 全年（或有数据的所有月份）概览 */
  overview(): OverviewStats {
    const all = transactionService.list({});
    const cfg = configRepository.getAll();

    // 按月份分组，避免对每个月重复查询数据库（原实现的 N+1 问题）
    const byMonth = new Map<string, Transaction[]>();
    for (const t of all) {
      const m = t.date.slice(0, 7);
      const arr = byMonth.get(m);
      if (arr) arr.push(t);
      else byMonth.set(m, [t]);
    }
    const months = Array.from(byMonth.keys()).sort();

    const monthList: OverviewStats['months'] = months.map((month) => {
      const m = this.buildMonthlyStats(month, byMonth.get(month)!, cfg);
      return { month, income: m.totalIncome, expense: m.totalExpense, balance: m.balance };
    });

    const yearIncome = round2(monthList.reduce((s, m) => s + m.income, 0));
    const yearExpense = round2(monthList.reduce((s, m) => s + m.expense, 0));

    // 年度聚合：复用已查到的全部交易，按支出分类与支付方式分别汇总
    const allExpenses = all.filter((t) => t.type === 'expense');

    return {
      months: monthList,
      yearIncome,
      yearExpense,
      yearBalance: round2(yearIncome - yearExpense),
      expenseByCategory: aggregate(allExpenses, buildCategoryIconMap(cfg), 'category'),
      expenseByPaymentMethod: aggregate(
        allExpenses,
        buildPaymentMethodIconMap(cfg),
        'paymentMethod',
      ),
    };
  }
}

export const statisticsService = new StatisticsService();
