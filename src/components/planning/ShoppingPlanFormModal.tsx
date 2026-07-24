import { useEffect, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import type { ShoppingPlan, ShoppingPlanInput, PlanPriority } from '@shared/types';
import { selectCategories, selectPaymentMethods, useConfigStore } from '@/store/configStore';
import { cn } from '@/lib/utils';
import Select from '@/components/Select';

interface Props {
  open: boolean;
  initial?: ShoppingPlan | null;
  onClose: () => void;
  onSubmit: (input: ShoppingPlanInput) => Promise<void>;
}

const PRIORITY_OPTIONS: { value: PlanPriority; label: string }[] = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

/** 下个月的 YYYY-MM */
function nextMonthStr(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ShoppingPlanFormModal({ open, initial, onClose, onSubmit }: Props) {
  const config = useConfigStore((s) => s.config);
  const [form, setForm] = useState<ShoppingPlanInput>({
    name: '',
    estimatedCost: 0,
    priority: 'medium',
    planMonth: nextMonthStr(),
    category: '',
    paymentMethod: '',
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
        estimatedCost: initial.estimatedCost,
        priority: initial.priority,
        planMonth: initial.planMonth,
        category: initial.category,
        paymentMethod: initial.paymentMethod,
        note: initial.note ?? '',
      });
    } else {
      setForm((f) => ({
        ...f,
        planMonth: nextMonthStr(),
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
    if (!form.name.trim()) return setError('请输入物品名称');
    if (!(form.estimatedCost > 0)) return setError('预计花费必须大于 0');
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
            {initial ? '编辑购物计划' : '新建购物计划'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
          <FormField label="物品名称">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例如 iPhone 17 Pro"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </FormField>

          <FormField label="预计花费 ¥">
            <div className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <span className="text-slate-400">¥</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.estimatedCost || ''}
                onChange={(e) => setForm((f) => ({ ...f, estimatedCost: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 }))}
                placeholder="0.00"
                className="h-full w-full bg-transparent text-lg font-semibold tnum text-slate-900 outline-none"
              />
            </div>
          </FormField>

          <FormField label="优先级">
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1">
              {PRIORITY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setForm((f) => ({ ...f, priority: o.value }))}
                  className={cn(
                    'rounded-md py-1.5 text-xs font-medium transition-all',
                    form.priority === o.value
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="计划购买月份">
            <input
              type="month"
              value={form.planMonth}
              onChange={(e) => setForm((f) => ({ ...f, planMonth: e.target.value }))}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
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
