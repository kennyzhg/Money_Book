import type { AppConfig, IconItem, TransactionType } from '../../shared/types.js';
import { db } from '../data/db.js';

/** 分类表行结构 */
interface CategoryRow {
  type: 'income' | 'expense';
  name: string;
  icon: string;
  sort_order: number;
}

/** 支付方式表行结构 */
interface PaymentMethodRow {
  name: string;
  icon: string;
  sort_order: number;
}

/**
 * 配置数据访问层（Repository）—— SQLite 实现
 *
 * - 方法签名与之前的内存实现保持一致
 * - 分类与支付方式可运行时增删，写入数据库持久化
 * - 业务层（service/controller）完全无感切换
 */
class ConfigRepository {
  /** 获取全部配置 */
  getAll(): AppConfig {
    return {
      categories: {
        income: this.getCategories('income'),
        expense: this.getCategories('expense'),
      },
      paymentMethods: this.getPaymentMethods(),
    };
  }

  /** 分类列表（按类型，按 sort_order 排序） */
  getCategories(type: TransactionType): IconItem[] {
    const rows = db
      .prepare('SELECT * FROM categories WHERE type = ? ORDER BY sort_order ASC')
      .all(type) as CategoryRow[];
    return rows.map((r) => ({ name: r.name, icon: r.icon }));
  }

  /** 支付方式列表（按 sort_order 排序） */
  getPaymentMethods(): IconItem[] {
    const rows = db
      .prepare('SELECT * FROM payment_methods ORDER BY sort_order ASC')
      .all() as PaymentMethodRow[];
    return rows.map((r) => ({ name: r.name, icon: r.icon }));
  }

  /** 添加分类（重名返回 false） */
  addCategory(type: TransactionType, item: IconItem): boolean {
    const existing = db
      .prepare('SELECT 1 FROM categories WHERE type = ? AND name = ?')
      .get(type, item.name);
    if (existing) return false;

    // 新分类排到末尾
    const maxOrder = (
      db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE type = ?')
        .get(type) as { m: number }
    ).m;
    db.prepare(
      'INSERT INTO categories (type, name, icon, sort_order) VALUES (?, ?, ?, ?)',
    ).run(type, item.name, item.icon, maxOrder + 1);
    return true;
  }

  /** 删除分类（不存在返回 false） */
  removeCategory(type: TransactionType, name: string): boolean {
    const result = db
      .prepare('DELETE FROM categories WHERE type = ? AND name = ?')
      .run(type, name);
    return result.changes > 0;
  }

  /** 添加支付方式（重名返回 false） */
  addPaymentMethod(item: IconItem): boolean {
    const existing = db
      .prepare('SELECT 1 FROM payment_methods WHERE name = ?')
      .get(item.name);
    if (existing) return false;

    const maxOrder = (
      db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM payment_methods')
        .get() as { m: number }
    ).m;
    db.prepare(
      'INSERT INTO payment_methods (name, icon, sort_order) VALUES (?, ?, ?)',
    ).run(item.name, item.icon, maxOrder + 1);
    return true;
  }

  /** 删除支付方式（不存在返回 false） */
  removePaymentMethod(name: string): boolean {
    const result = db.prepare('DELETE FROM payment_methods WHERE name = ?').run(name);
    return result.changes > 0;
  }
}

export const configRepository = new ConfigRepository();
