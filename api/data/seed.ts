import type { Transaction } from '../../shared/types.js';

/**
 * 演示数据：覆盖 2026 年 5/6/7 月，覆盖各类分类与支付方式。
 * 保证仪表盘与图表启动即有内容。
 * createdAt/updatedAt 在仓库初始化时自动补齐。
 */
type Seed = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

const seedData: Seed[] = [
  // ===== 2026-05 =====
  { date: '2026-05-01', amount: 12000, type: 'income', category: '工资', paymentMethod: '银行卡', note: '5月工资' },
  { date: '2026-05-03', amount: 1800, type: 'income', category: '兼职', paymentMethod: '支付宝', note: '设计外包' },
  { date: '2026-05-05', amount: 38, type: 'expense', category: '餐饮', paymentMethod: '微信', note: '早餐' },
  { date: '2026-05-06', amount: 156, type: 'expense', category: '餐饮', paymentMethod: '支付宝', note: '聚餐' },
  { date: '2026-05-08', amount: 60, type: 'expense', category: '交通', paymentMethod: '微信', note: '打车' },
  { date: '2026-05-10', amount: 899, type: 'expense', category: '购物', paymentMethod: '花呗', note: '衣服' },
  { date: '2026-05-12', amount: 2200, type: 'expense', category: '居住', paymentMethod: '银行卡', note: '房租' },
  { date: '2026-05-15', amount: 128, type: 'expense', category: '娱乐', paymentMethod: '微信', note: '电影' },
  { date: '2026-05-20', amount: 320, type: 'expense', category: '餐饮', paymentMethod: '支付宝', note: '外卖累计' },

  // ===== 2026-06 =====
  { date: '2026-06-01', amount: 12000, type: 'income', category: '工资', paymentMethod: '银行卡', note: '6月工资' },
  { date: '2026-06-05', amount: 500, type: 'income', category: '奖金', paymentMethod: '微信', note: '项目奖' },
  { date: '2026-06-04', amount: 45, type: 'expense', category: '餐饮', paymentMethod: '微信', note: '早餐' },
  { date: '2026-06-06', amount: 88, type: 'expense', category: '交通', paymentMethod: '支付宝', note: '加油' },
  { date: '2026-06-09', amount: 1299, type: 'expense', category: '购物', paymentMethod: '抖音月付', note: '耳机' },
  { date: '2026-06-12', amount: 2200, type: 'expense', category: '居住', paymentMethod: '银行卡', note: '房租' },
  { date: '2026-06-18', amount: 199, type: 'expense', category: '娱乐', paymentMethod: '支付宝', note: '游戏充值' },
  { date: '2026-06-22', amount: 380, type: 'expense', category: '医疗', paymentMethod: '微信', note: '门诊' },
  { date: '2026-06-28', amount: 600, type: 'expense', category: '教育', paymentMethod: '支付宝', note: '网课' },
  { date: '2026-06-30', amount: 260, type: 'expense', category: '餐饮', paymentMethod: '花呗', note: '聚餐' },

  // ===== 2026-07 =====
  { date: '2026-07-01', amount: 12500, type: 'income', category: '工资', paymentMethod: '银行卡', note: '7月工资' },
  { date: '2026-07-03', amount: 1200, type: 'income', category: '兼职', paymentMethod: '支付宝', note: '咨询费' },
  { date: '2026-07-02', amount: 42, type: 'expense', category: '餐饮', paymentMethod: '微信', note: '早餐' },
  { date: '2026-07-05', amount: 2300, type: 'expense', category: '居住', paymentMethod: '银行卡', note: '房租' },
  { date: '2026-07-07', amount: 156, type: 'expense', category: '餐饮', paymentMethod: '支付宝', note: '聚餐' },
  { date: '2026-07-09', amount: 75, type: 'expense', category: '交通', paymentMethod: '微信', note: '打车' },
  { date: '2026-07-11', amount: 459, type: 'expense', category: '购物', paymentMethod: '花呗', note: '日用品' },
  { date: '2026-07-14', amount: 280, type: 'expense', category: '娱乐', paymentMethod: '抖音月付', note: '演唱会票' },
  { date: '2026-07-16', amount: 168, type: 'expense', category: '医疗', paymentMethod: '支付宝', note: '药品' },
  { date: '2026-07-18', amount: 320, type: 'expense', category: '餐饮', paymentMethod: '微信', note: '外卖累计' },
];

export default seedData;
