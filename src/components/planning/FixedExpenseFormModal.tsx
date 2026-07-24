import { useEffect, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import type { FixedExpense, FixedExpenseInput } from '@shared/types';
import { selectCategories, selectPaymentMethods, useConfigStore } from '@/store/configStore';
import { currentMonth } from '@/lib/format';
import Select from '@/components/Select';
import IconPicker from '@/components/IconPicker';

interface Props {
  open: boolean;
  initial?: FixedExpense | null;
  onClose: () => void;
  onSubmit: (input: FixedExpenseInput) => Promise<void>;
}

export default function FixedExpenseFormModal({ open, initial, onClose, onSubmit }: Props) {
  const config = useConfigStore((s) => s.config);
  const [form, setForm] = useState<FixedExpenseInput>({
    name: '',
    amount: 0,
    category: '',
    paymentMethod: '',
    icon: 'repeat',
    enabled: true,
    startMonth: currentMonth(),
    note: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const expenseCats = selectCategories(config, 'expense');
    const payments = selectPaymentMethods(config);
    if (initial) {
      setForm({
        name: initial.name,
        amount: initial.amount,
        category: initial.category,
        paymentMethod: initial.paymentMethod,
        icon: initial.icon,
        enabled: initial.enabled,
        startMonth: initial.startMonth,
        note: initial.note ?? '',
      });
    } else {
      setForm((f) => ({
        ...f,
        category: expenseCats[0]?.name ?? '',
        paymentMethod: payments[0]?.name ?? '',
      }));
    }
  }, [open, initial, config]);

  if (!open) return null;

  const expenseCats = selectCategories(config, 'expense');
  const payments = selectPaymentMethods(config);

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) return setError('请输入名称');
    if (!(form.amount > 0)) return setError('金额必须大于 0');
    if (!form.category) return setError('请选择分类');
    if (!form.paymentMethod) return setError('请选择支付方式');
    setSubmitting(true);
    try {
      await onSubmit({ ...form, note: form.note?.trim() || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-in-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:max-h-[90vh] md:max-w-md md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 md:px-6">
          <h2 className="text-base font-semibold text-slate-900">
            {initial ? '编辑固定支出' : '新建固定支出'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
          <FormField label="名称">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例如 网费"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </FormField>

          <FormField label="每月金额 ¥">
            <div className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <span className="text-slate-400">¥</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount || ''}
                onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 }))}
                placeholder="0.00"
                className="h-full w-full bg-transparent text-lg font-semibold tnum text-slate-900 outline-none"
              />
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="支出分类">
              <Select value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                {expenseCats.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="支付方式">
              <Select value={form.paymentMethod} onChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}>
                {payments.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="生效起始月份">
            <input
              type="month"
              value={form.startMonth}
              onChange={(e) => setForm((f) => ({ ...f, startMonth: e.target.value }))}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </FormField>

          <FormField label="图标">
            <IconPicker value={form.icon} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} />
          </FormField>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            启用（计入每月预算）
          </label>

          <FormField label="备注">
            <input
              type="text"
              value={form.note ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="选填"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </FormField>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-4 md:px-6"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}
