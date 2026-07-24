import { useMemo, useState } from 'react';
import { Calculator, Info } from 'lucide-react';
import type { InstallmentMethod } from '@shared/types';
import { calcInstallmentApi } from '@/api/installments';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CalcResult {
  monthlyPayment: number;
  totalInterest: number;
  totalPayment: number;
}

/** 分期计算器（纯计算，不入库）。使用标准等额本息/等额本金公式 */
export default function InstallmentCalculator() {
  const [principal, setPrincipal] = useState('100000');
  const [annualRate, setAnnualRate] = useState('4.75');
  const [termMonths, setTermMonths] = useState('36');
  const [method, setMethod] = useState<InstallmentMethod>('equal_payment');
  const [result, setResult] = useState<CalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCalc = Number(principal) > 0 && Number(annualRate) >= 0 && Number(termMonths) > 0;

  const handleCalc = async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await calcInstallmentApi({
        principal: Number(principal),
        annualRate: Number(annualRate),
        termMonths: Number(termMonths),
        method,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : '计算失败');
    } finally {
      setLoading(false);
    }
  };

  // 本地公式预览（无需等待网络），与服务端一致
  const preview = useMemo<CalcResult | null>(() => {
    const p = Number(principal);
    const r = Number(annualRate);
    const n = Number(termMonths);
    if (!(p > 0) || !(n > 0) || !(r >= 0)) return null;
    const mRate = r / 100 / 12;
    if (method === 'equal_payment') {
      if (mRate === 0) {
        const mp = p / n;
        return { monthlyPayment: mp, totalInterest: 0, totalPayment: p };
      }
      const pow = Math.pow(1 + mRate, n);
      const mp = (p * mRate * pow) / (pow - 1);
      return {
        monthlyPayment: mp,
        totalInterest: mp * n - p,
        totalPayment: mp * n,
      };
    }
    // equal_principal
    const totalInterest = ((n + 1) * p * mRate) / 2;
    const first = p / n + p * mRate;
    return {
      monthlyPayment: first,
      totalInterest,
      totalPayment: p + totalInterest,
    };
  }, [principal, annualRate, termMonths, method]);

  const display = result ?? preview;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Calculator size={16} />
        </span>
        <h3 className="text-sm font-semibold text-slate-900">分期试算</h3>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="本金（元）">
          <NumberInput value={principal} onChange={setPrincipal} placeholder="100000" />
        </Field>
        <Field label="年利率（%）">
          <NumberInput value={annualRate} onChange={setAnnualRate} placeholder="4.75" />
        </Field>
        <Field label="期数（月）">
          <NumberInput value={termMonths} onChange={setTermMonths} placeholder="36" />
        </Field>
        <Field label="还款方式">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            {(
              [
                ['equal_payment', '等额本息'],
                ['equal_principal', '等额本金'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setMethod(val)}
                className={cn(
                  'rounded-md py-1.5 text-xs font-medium transition-all',
                  method === val
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <button
        onClick={handleCalc}
        disabled={!canCalc || loading}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
      >
        {loading ? '计算中…' : '精确计算'}
      </button>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {display && (
        <div className="mt-5 grid grid-cols-3 gap-3">
          <ResultCard
            label="每月还款"
            value={formatCurrency(display.monthlyPayment)}
            tone="blue"
          />
          <ResultCard
            label="总利息"
            value={formatCurrency(display.totalInterest)}
            tone="amber"
          />
          <ResultCard
            label="总还款"
            value={formatCurrency(display.totalPayment)}
            tone="slate"
          />
        </div>
      )}

      {method === 'equal_principal' && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
          <Info size={13} className="mt-0.5 shrink-0" />
          等额本金每月还款额递减，此处"每月还款"为首月金额；入账时按月均还款额（总还款÷期数）计入。
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      placeholder={placeholder}
      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm tnum text-slate-900 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
    />
  );
}

const toneMap = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  slate: 'bg-slate-50 text-slate-700 ring-slate-100',
} as const;

function ResultCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'amber' | 'slate';
}) {
  return (
    <div className={cn('rounded-xl p-3 ring-1', toneMap[tone])}>
      <p className="text-[11px] opacity-80">{label}</p>
      <p className="mt-1 text-base font-semibold tnum md:text-lg">{value}</p>
    </div>
  );
}
