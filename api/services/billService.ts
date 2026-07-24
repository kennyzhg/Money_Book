import type {
  ProjectedItem,
  MonthlyBudgetReport,
  YearlyBudgetReport,
  BillOverview,
  AppConfig,
} from '../../shared/types.js';
import { fixedExpenseRepository } from '../repositories/fixedExpenseRepository.js';
import { installmentRepository } from '../repositories/installmentRepository.js';
import { shoppingPlanRepository } from '../repositories/shoppingPlanRepository.js';
import { transactionRepository } from '../repositories/transactionRepository.js';
import { configRepository } from '../repositories/configRepository.js';
import {
  buildCategoryIconMap,
} from '../config/appConfig.js';
import { round2 } from '../utils/math.js';

/**
 * 构建某月的预计支出明细：固定支出 + 进行中分期 + 该月购物计划
 * 三类来源合并为 ProjectedItem[]
 */
function buildProjectedItems(month: string, cfg: AppConfig): ProjectedItem[] {
  const catIcon = buildCategoryIconMap(cfg);
  const items: ProjectedItem[] = [];

  // 1. 固定支出（已启用且在该月生效）
  for (const fx of fixedExpenseRepository.listEffective(month)) {
    items.push({
      source: 'fixed',
      refId: fx.id,
      name: fx.name,
      category: fx.category,
      paymentMethod: fx.paymentMethod,
      amount: fx.amount,
      icon: fx.icon || catIcon[fx.category] || 'repeat',
    });
  }

  // 2. 分期（active 且在还款周期内）
  for (const inst of installmentRepository.listActiveByMonth(month)) {
    const monthly =
      inst.method === 'equal_payment'
        ? inst.monthlyPayment
        : round2(inst.totalPayment / inst.termMonths);
    items.push({
      source: 'installment',
      refId: inst.id,
      name: inst.name,
      category: inst.category,
      paymentMethod: inst.paymentMethod,
      amount: monthly,
      icon: catIcon[inst.category] || 'credit-card',
    });
  }

  // 3. 购物计划（该月未取消的）
  for (const plan of shoppingPlanRepository.listByMonth(month)) {
    items.push({
      source: 'plan',
      refId: plan.id,
      name: plan.name,
      category: plan.category,
      paymentMethod: plan.paymentMethod,
      amount: plan.estimatedCost,
      icon: catIcon[plan.category] || 'shopping-bag',
      priority: plan.priority,
    });
  }
  return items;
}

/** 把该月实际支出按分类聚合成 ActualItem[] */
function buildActualItems(month: string, cfg: AppConfig) {
  const catIcon = buildCategoryIconMap(cfg);
  const txs = transactionRepository.list({ month, type: 'expense' });
  const byCat = new Map<string, { amount: number; count: number }>();
  for (const t of txs) {
    const cur = byCat.get(t.category) ?? { amount: 0, count: 0 };
    cur.amount += t.amount;
    cur.count += 1;
    byCat.set(t.category, cur);
  }
  return Array.from(byCat.entries())
    .map(([category, v]) => ({
      category,
      icon: catIcon[category] ?? 'circle',
      amount: round2(v.amount),
      count: v.count,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** 计算某月份的"预计/实际"月度报表 */
function buildMonthlyReport(month: string, cfg: AppConfig): MonthlyBudgetReport {
  const projectedItems = buildProjectedItems(month, cfg);
  const actualItems = buildActualItems(month, cfg);
  const projectedExpense = round2(projectedItems.reduce((s, i) => s + i.amount, 0));
  const actualExpense = round2(actualItems.reduce((s, i) => s + i.amount, 0));
  return {
    month,
    projectedExpense,
    actualExpense,
    diff: round2(actualExpense - projectedExpense),
    projectedItems,
    actualItems,
  };
}

/** 列出某年所有需要纳入预算对比的月份（有实际交易或有预计项的月份） */
function listRelevantMonths(year: string): string[] {
  const monthSet = new Set<string>();
  // 实际交易
  const txs = transactionRepository.list({ year });
  for (const t of txs) monthSet.add(t.date.slice(0, 7));
  // 固定支出
  for (const fx of fixedExpenseRepository.list()) {
    if (fx.startMonth.startsWith(year)) {
      // 该固定支出在该年所有 >= startMonth 的月份都生效
      const startIdx = Number(fx.startMonth.slice(5, 7));
      for (let m = startIdx; m <= 12; m++) {
        monthSet.add(`${year}-${String(m).padStart(2, '0')}`);
      }
    }
  }
  // 分期
  for (const inst of installmentRepository.list()) {
    if (inst.status !== 'active') continue;
    const start = inst.startMonth;
    const endIdx = Number(start.slice(5, 7)) + inst.termMonths;
    // 简化：只取起始年等于目标年的分期
    if (start.startsWith(year)) {
      const startIdx = Number(start.slice(5, 7));
      const endClamped = Math.min(endIdx, 12);
      for (let m = startIdx; m <= endClamped; m++) {
        monthSet.add(`${year}-${String(m).padStart(2, '0')}`);
      }
    }
  }
  // 购物计划
  for (const plan of shoppingPlanRepository.list()) {
    if (plan.planMonth.startsWith(year)) monthSet.add(plan.planMonth);
  }
  return Array.from(monthSet).sort();
}

class BillService {
  /** 月度预算对比报表 */
  monthlyReport(month: string): MonthlyBudgetReport {
    const cfg = configRepository.getAll();
    return buildMonthlyReport(month, cfg);
  }

  /** 年度预算对比报表 */
  yearlyReport(year: string): YearlyBudgetReport {
    const cfg = configRepository.getAll();
    const months = listRelevantMonths(year);
    const monthReports = months.map((m) => buildMonthlyReport(m, cfg));
    const projectedExpense = round2(monthReports.reduce((s, r) => s + r.projectedExpense, 0));
    const actualExpense = round2(monthReports.reduce((s, r) => s + r.actualExpense, 0));
    return {
      year,
      projectedExpense,
      actualExpense,
      diff: round2(actualExpense - projectedExpense),
      months: monthReports.map((r) => ({
        month: r.month,
        projectedExpense: r.projectedExpense,
        actualExpense: r.actualExpense,
        diff: r.diff,
      })),
    };
  }

  /**
   * 账单总览：逐项对比
   * 把预计项与实际支出按分类对齐，逐行展示差异
   */
  billOverview(month: string): BillOverview {
    const cfg = configRepository.getAll();
    const report = buildMonthlyReport(month, cfg);

    // 以"分类"为键聚合，对齐预计/实际
    const projectedByCat = new Map<string, { amount: number; items: ProjectedItem[] }>();
    for (const p of report.projectedItems) {
      const cur = projectedByCat.get(p.category) ?? { amount: 0, items: [] };
      cur.amount += p.amount;
      cur.items.push(p);
      projectedByCat.set(p.category, cur);
    }
    const actualByCat = new Map<string, number>();
    for (const a of report.actualItems) {
      actualByCat.set(a.category, (actualByCat.get(a.category) ?? 0) + a.amount);
    }

    // 合并所有出现过的分类
    const allCats = new Set([...projectedByCat.keys(), ...actualByCat.keys()]);
    const catIcon = buildCategoryIconMap(cfg);

    const items = Array.from(allCats)
      .map((category) => {
        const proj = projectedByCat.get(category);
        const projected = round2(proj?.amount ?? 0);
        const actual = round2(actualByCat.get(category) ?? 0);
        // 名称：优先用预计项的名称，否则用分类名
        const name = proj?.items[0]?.name ?? category;
        // 来源：如果预计侧有，取第一个来源；否则标为 actual-only（用 fixed 占位）
        const source = proj?.items[0]?.source ?? 'fixed';
        return {
          name,
          category,
          projected,
          actual,
          diff: round2(actual - projected),
          source,
          icon: catIcon[category] ?? 'circle',
        };
      })
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    return {
      month,
      projectedTotal: report.projectedExpense,
      actualTotal: report.actualExpense,
      diff: report.diff,
      items,
    };
  }
}

export const billService = new BillService();
