import { useEffect, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import type { Transaction, TransactionInput, TransactionType } from '@shared/types';
import {
  selectCategories,
  selectPaymentMethods,
  useConfigStore,
} from '@/store/configStore';
import { today } from '@/lib/format';
import { cn } from '@/lib/utils';
import Select from './Select';
import CategoryIcon from './CategoryIcon';

interface TransactionFormModalProps {
  open: boolean;
  initial?: Transaction | null;
  onClose: () => void;
  onSubmit: (input: TransactionInput) => Promise<void>;
}

const emptyInput = (type: TransactionType): TransactionInput => ({
  date: today(),
  amount: 0,
  type,
  category: '',
  paymentMethod: '',
  note: '',
});

export default function TransactionFormModal({
  open,
  initial,
  onClose,
  onSubmit,
}: TransactionFormModalProps) {
  const config = useConfigStore((s) => s.config);
  const [form, setForm] = useState<TransactionInput>(emptyInput('expense'));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      const { date, amount, type, category, paymentMethod, note } = initial;
      setForm({ date, amount, type, category, paymentMethod, note });
    } else {
      const expenseCats = selectCategories(config, 'expense');
      const payments = selectPaymentMethods(config);
      setForm({
        ...emptyInput('expense'),
        category: expenseCats[0]?.name ?? '',
        paymentMethod: payments[0]?.name ?? '',
      });
    }
  }, [open, initial, config]);

  if (!open) return null;

  const categories = selectCategories(config, form.type);
  const paymentMethods = selectPaymentMethods(config);

  const setType = (type: TransactionType) => {
    const cats = selectCategories(config, type);
    setForm((f) => ({ ...f, type, category: cats[0]?.name ?? '' }));
  };

  const handleAmountChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    const normalized =
      parts.length > 1 ? `${parts[0]}.${parts[1].slice(0, 2)}` : parts[0];
    // Number(normalized) 在 '.' 或 '' 时返回 NaN，用 || 0 兜底避免输入框显示 "NaN"
    setForm((f) => ({ ...f, amount: Number(normalized) || 0 }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('请选择日期');
      return;
    }
    if (!form.amount || form.amount <= 0) {
      setError('请输入大于 0 的金额');
      return;
    }
    if (!form.category) {
      setError('请选择分类');
      return;
    }
    if (!form.paymentMethod) {
      setError('请选择支付方式');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        amount: Math.round(form.amount * 100) / 100,
        note: form.note?.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const currentPayment = paymentMethods.find((p) => p.name === form.paymentMethod);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-in-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:max-h-[90vh] md:max-w-md md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 md:px-6">
          <h2 className="text-base font-semibold text-slate-900">
            {initial ? '编辑交易' : '记一笔'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'rounded-lg py-2 text-sm font-medium transition-all',
                  form.type === t
                    ? t === 'expense'
                      ? 'bg-white text-rose-600 shadow-sm'
                      : 'bg-white text-emerald-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {t === 'expense' ? '支出' : '收入'}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">金额</label>
            <div className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <span className="text-lg text-slate-400">¥</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount === 0 ? '' : String(form.amount)}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.00"
                className="h-full w-full bg-transparent text-xl font-semibold tnum text-slate-900 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">日期</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">分类</label>
            <Select
              value={form.category}
              onChange={(v) => setForm((f) => ({ ...f, category: v }))}
            >
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">支付方式</label>
            <Select
              value={form.paymentMethod}
              onChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
              leadingIcon={
                currentPayment ? (
                  <CategoryIcon
                    icon={currentPayment.icon}
                    size={14}
                    className="h-6 w-6"
                  />
                ) : null
              }
            >
              {paymentMethods.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">备注</label>
            <input
              type="text"
              value={form.note ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="选填，例如 聚餐"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-4 md:px-6"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
