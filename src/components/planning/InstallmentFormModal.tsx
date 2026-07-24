import { useEffect, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import type { Installment, InstallmentInput, InstallmentKind, InstallmentMethod } from '@shared/types';
import { selectCategories, selectPaymentMethods, useConfigStore } from '@/store/configStore';
import { currentMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import Select from '@/components/Select';

interface Props {
  open: boolean;
  initial?: Installment | null;
  onClose: () => void;
  onSubmit: (input: InstallmentInput) => Promise<void>;
}

const KIND_OPTIONS: { value: InstallmentKind; label: string }[] = [
  { value: 'car', label: '车贷' },
  { value: 'house', label: '房贷' },
  { value: 'electronics', label: '电子产品' },
  { value: 'other', label: '其他' },
];

const METHOD_OPTIONS: { value: InstallmentMethod; label: string }[] = [
  { value: 'equal_payment', label: '等额本息' },
  { value: 'equal_principal', label: '等额本金' },
];

export default function InstallmentFormModal({ open, initial, onClose, onSubmit }: Props) {
  const config = useConfigStore((s) => s.config);
  const [form, setForm] = useState<InstallmentInput>({
    name: '',
    kind: 'car',
    method: 'equal_payment',
    principal: 0,
    annualRate: 0,
    termMonths: 12,
    startMonth: currentMonth(),
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
        kind: initial.kind,
        method: initial.method,
        principal: initial.principal,
        annualRate: initial.annualRate,
        termMonths: initial.termMonths,
        startMonth: initial.startMonth,
        category: initial.category,
        paymentMethod: initial.paymentMethod,
        status: initial.status,
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
    if (!(form.principal > 0)) return setError('本金必须大于 0');
    if (!(form.termMonths > 0)) return setError('期数必须大于 0');
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

  const setNum = (key: 'principal' | 'annualRate' | 'termMonths', raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, '');
    setForm((f) => ({ ...f, [key]: Number(cleaned) || 0 }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-in-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:max-h-[90vh] md:max-w-lg md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 md:px-6">
          <h2 className="text-base font-semibold text-slate-900">
            {initial ? '编辑分期' : '新建分期'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
          <FormField label="名称">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例如 车贷-比亚迪汉"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="分期类型">
              <Select value={form.kind} onChange={(v) => setForm((f) => ({ ...f, kind: v as InstallmentKind }))}>
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="还款方式">
              <Select value={form.method} onChange={(v) => setForm((f) => ({ ...f, method: v as InstallmentMethod }))}>
                {METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="本金 ¥">
              <input
                type="text"
                inputMode="decimal"
                value={form.principal || ''}
                onChange={(e) => setNum('principal', e.target.value)}
                placeholder="100000"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm tnum text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FormField>
            <FormField label="年利率 %">
              <input
                type="text"
                inputMode="decimal"
                value={form.annualRate || ''}
                onChange={(e) => setNum('annualRate', e.target.value)}
                placeholder="4.75"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm tnum text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FormField>
            <FormField label="期数 月">
              <input
                type="text"
                inputMode="numeric"
                value={form.termMonths || ''}
                onChange={(e) => setNum('termMonths', e.target.value)}
                placeholder="36"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm tnum text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FormField>
          </div>

          <FormField label="起始月份">
            <input
              type="month"
              value={form.startMonth}
              onChange={(e) => setForm((f) => ({ ...f, startMonth: e.target.value }))}
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
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60',
            )}
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
