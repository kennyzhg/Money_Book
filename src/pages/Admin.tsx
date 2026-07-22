import { useEffect, useState } from 'react';
import type { IconItem, TransactionType } from '@shared/types';
import {
  addCategory,
  addPaymentMethod,
  removeCategory,
  removePaymentMethod,
} from '@/api/config';
import {
  selectCategories,
  selectPaymentMethods,
  useConfigStore,
} from '@/store/configStore';
import PageHeader from '@/components/PageHeader';
import IconPicker from '@/components/IconPicker';
import CategoryIcon from '@/components/CategoryIcon';
import {
  Settings,
  Plus,
  Trash2,
  Loader2,
  TrendingUp,
  TrendingDown,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Admin() {
  const config = useConfigStore((s) => s.config);
  const load = useConfigStore((s) => s.load);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    load(true).catch((e) => setError(e instanceof Error ? e.message : '加载失败'));
  }, [load]);

  const refresh = async () => {
    try {
      await load(true);
      setNotice('配置已刷新');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '刷新失败');
    }
  };

  return (
    <div>
      <PageHeader
        title="管理"
        subtitle="自定义账单的分类与支付方式（立即生效，供新建账单使用）"
        actions={
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
          >
            <Settings size={14} />
            刷新
          </button>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryManager type="income" />
        <CategoryManager type="expense" />
      </div>

      <div className="mt-4">
        <PaymentMethodManager />
      </div>

      <p className="mt-4 text-xs text-slate-400">
        注意：若某分类或支付方式已被交易引用，将无法删除（需先迁移或删除相关交易）。
      </p>
    </div>
  );
}

/* ============== 分类管理面板 ============== */
function CategoryManager({ type }: { type: TransactionType }) {
  const config = useConfigStore((s) => s.config);
  const load = useConfigStore((s) => s.load);
  const list = selectCategories(config, type);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState(type === 'income' ? 'wallet' : 'utensils');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isIncome = type === 'income';
  const ToneIcon = isIncome ? TrendingUp : TrendingDown;

  const handleAdd = async () => {
    setLocalError(null);
    if (!name.trim()) {
      setLocalError('请输入分类名称');
      return;
    }
    setSubmitting(true);
    try {
      await addCategory(type, { name: name.trim(), icon });
      setName('');
      await load(true);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (item: IconItem) => {
    if (!window.confirm(`确定删除分类「${item.name}」？`)) return;
    try {
      await removeCategory(type, item.name);
      await load(true);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <ToneIcon size={16} className={isIncome ? 'text-emerald-600' : 'text-rose-600'} />
        <h2 className="text-sm font-semibold text-slate-900">
          {isIncome ? '收入分类' : '支出分类'}
          <span className="ml-2 text-xs font-normal text-slate-400">{list.length} 项</span>
        </h2>
      </div>

      {/* 添加表单：桌面端三列横排，移动端纵向堆叠 */}
      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_auto] md:items-start">
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="分类名称，如 副业"
            maxLength={20}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <IconPicker value={icon} onChange={setIcon} />
        <button
          onClick={handleAdd}
          disabled={submitting}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          添加
        </button>
      </div>
      {localError && <p className="mb-3 text-xs text-rose-600">{localError}</p>}

      {/* 列表 */}
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">暂无分类</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {list.map((item) => (
            <li
              key={item.name}
              className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-1.5 pr-2 text-sm"
            >
              <CategoryIcon icon={item.icon} tone={type} size={14} className="h-7 w-7" />
              <span className="text-slate-700">{item.name}</span>
              <button
                onClick={() => handleRemove(item)}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-600"
                title="删除"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ============== 支付方式管理面板 ============== */
function PaymentMethodManager() {
  const config = useConfigStore((s) => s.config);
  const load = useConfigStore((s) => s.load);
  const list = selectPaymentMethods(config);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('credit-card');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleAdd = async () => {
    setLocalError(null);
    if (!name.trim()) {
      setLocalError('请输入支付方式名称');
      return;
    }
    setSubmitting(true);
    try {
      await addPaymentMethod({ name: name.trim(), icon });
      setName('');
      await load(true);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (item: IconItem) => {
    if (!window.confirm(`确定删除支付方式「${item.name}」？`)) return;
    try {
      await removePaymentMethod(item.name);
      await load(true);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <CreditCard size={16} className="text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-900">
          支付方式
          <span className="ml-2 text-xs font-normal text-slate-400">{list.length} 项</span>
        </h2>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_auto] md:items-start">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="支付方式名称，如 京东白条"
          maxLength={20}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <IconPicker value={icon} onChange={setIcon} />
        <button
          onClick={handleAdd}
          disabled={submitting}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          添加
        </button>
      </div>
      {localError && <p className="mb-3 text-xs text-rose-600">{localError}</p>}

      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">暂无支付方式</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {list.map((item) => (
            <li
              key={item.name}
              className={cn(
                'group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-1.5 pr-2 text-sm',
              )}
            >
              <CategoryIcon icon={item.icon} tone="slate" size={14} className="h-7 w-7" />
              <span className="text-slate-700">{item.name}</span>
              <button
                onClick={() => handleRemove(item)}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-600"
                title="删除"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
