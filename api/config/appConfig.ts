import type { AppConfig } from '../../shared/types.js';

/**
 * 初始应用配置：分类、支付方式及其对应 lucide-react 图标名。
 * Agent-Friendly：每项都自带 icon 字段，便于消费端自描述渲染。
 *
 * 图标选型原则（与 src/lib/icons.tsx 中 ICON_MAP 一致）：
 * - 围绕"记账 / 消费 / 货币"主题，避免风格混杂；
 * - 收入类用收入符号（钱包、奖金、上涨等）；
 * - 支出类按消费场景选语义化图标；
 * - 支付方式：银行卡 / 信用类用 'landmark'（银行），钱包类用 'wallet'。
 *
 * 注意：运行时可被管理员修改，请通过 configRepository 读写。
 */
export const initialConfig: AppConfig = {
  categories: {
    income: [
      { name: '工资', icon: 'wallet' },
      { name: '兼职', icon: 'briefcase' },
      { name: '奖金', icon: 'gift' },
      { name: '投资收益', icon: 'trending-up' },
    ],
    expense: [
      { name: '餐饮', icon: 'utensils' },
      { name: '交通', icon: 'car' },
      { name: '购物', icon: 'shopping-bag' },
      { name: '娱乐', icon: 'gamepad-2' },
      { name: '居住', icon: 'home' },
      { name: '医疗', icon: 'heart-pulse' },
      { name: '教育', icon: 'graduation-cap' },
    ],
  },
  // 支付方式图标策略：
  // - 银行卡 / 花呗（信用类） -> landmark（银行）
  // - 支付宝 / 微信 / 抖音月付（钱包类） -> wallet（钱包）
  paymentMethods: [
    { name: '银行卡', icon: 'landmark' },
    { name: '支付宝', icon: 'wallet' },
    { name: '微信', icon: 'wallet' },
    { name: '抖音月付', icon: 'wallet' },
    { name: '花呗', icon: 'landmark' },
  ],
};

/** 动态构建：分类名 -> 图标 的映射（含收入与支出） */
export function buildCategoryIconMap(config: AppConfig): Record<string, string> {
  return {
    ...Object.fromEntries(config.categories.income.map((c) => [c.name, c.icon])),
    ...Object.fromEntries(config.categories.expense.map((c) => [c.name, c.icon])),
  };
}

/** 动态构建：支付方式名 -> 图标 的映射 */
export function buildPaymentMethodIconMap(config: AppConfig): Record<string, string> {
  return Object.fromEntries(config.paymentMethods.map((p) => [p.name, p.icon]));
}
