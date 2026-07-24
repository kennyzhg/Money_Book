import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { BillOverview } from '@shared/types';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Select from '@/components/Select';
import CategoryIcon from '@/components/CategoryIcon';
import { fetchBillOverview } from '@/api/bills';
import {
  currentMonth,
  formatCurrency,
  formatMonthLabel,
  getRecentMonths,
} from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Bill() {
  const [month, setMonth] = useState(currentMonth());
  const [bill, setBill] = useState<BillOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBill(await fetchBillOverview(month));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    reload();
  }, [reload]);

  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div>
      <PageHeader title="账单总览" subtitle={`${formatMonthLabel(month)} · 预计账单 vs 实际账单`} />

      <div className="mb-4 flex items-center gap-2 md:mb-6">
        <button onClick={() => shift(-1)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50">
          <ChevronLeft size={16} />
        </button>
        <Select value={month} onChange={setMonth} className="min-w-[140px]">
          {getRecentMonths(12).map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </Select>
        <button onClick={() => shift(1)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50">
          <ChevronRight size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-600">{error}</div>
      ) : bill ? (
        <div className="space-y-4 md:space-y-6">
          {/* 总览三卡 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <TotalCard label="预计账单" amount={bill.projectedTotal} tone="slate" />
            <TotalCard label="实际账单" amount={bill.actualTotal} tone="blue" />
            <DiffCard diff={bill.diff} />
          </div>

          {/* 逐项对比 */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">逐项对比</h3>
            {bill.items.length === 0 ? (
              <EmptyState icon={FileText} title="本月暂无对比数据" hint="记账或添加预算项后将自动生成对比" />
            ) : (
              <>
                {/* 表头（仅桌面端） */}
                <div className="hidden grid-cols-12 gap-2 border-b border-slate-100 pb-2 text-xs font-medium text-slate-400 md:grid">
                  <div className="col-span-5">项目</div>
                  <div className="col-span-2 text-right">预计</div>
                  <div className="col-span-2 text-right">实际</div>
                  <div className="col-span-3 text-right">差额</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {bill.items.map((it, idx) => (
                    <div key={`${it.category}-${idx}`} className="grid grid-cols-12 items-center gap-2 py-3">
                      <div className="col-span-12 flex items-center gap-3 md:col-span-5">
                        <CategoryIcon icon={it.icon} size={14} className="h-8 w-8" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{it.name}</p>
                          <p className="text-xs text-slate-400">
                            {it.category} · {SOURCE_LABEL[it.source] ?? '其他'}
                          </p>
                        </div>
                      </div>
                      <div className="col-span-4 text-left text-sm tnum text-slate-500 md:col-span-2 md:text-right">
                        <span className="text-slate-400 md:hidden">预计 </span>{formatCurrency(it.projected)}
                      </div>
                      <div className="col-span-4 text-left text-sm tnum text-slate-900 md:col-span-2 md:text-right">
                        <span className="text-slate-400 md:hidden">实际 </span>{formatCurrency(it.actual)}
                      </div>
                      <div className={cn(
                        'col-span-4 text-left text-sm tnum font-medium md:col-span-3 md:text-right',
                        it.diff > 0 ? 'text-rose-600' : it.diff < 0 ? 'text-emerald-600' : 'text-slate-400',
                      )}>
                        {it.diff > 0 ? '+' : ''}{formatCurrency(it.diff)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TotalCard({ label, amount, tone }: { label: string; amount: number; tone: 'slate' | 'blue' }) {
  const c = tone === 'blue' ? 'text-blue-700' : 'text-slate-700';
  return (
    <div className="animate-fade-in-up rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tnum tracking-tight md:text-3xl', c)}>{formatCurrency(amount)}</p>
    </div>
  );
}

function DiffCard({ diff }: { diff: number }) {
  const over = diff > 0;
  const under = diff < 0;
  const Icon = over ? TrendingUp : under ? TrendingDown : Minus;
  const tone = over ? 'rose' : under ? 'emerald' : 'slate';
  const styles = {
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    slate: 'bg-slate-50 text-slate-600 ring-slate-100',
  }[tone];
  return (
    <div className={cn('animate-fade-in-up rounded-2xl p-4 ring-1 md:p-5', styles)}>
      <div className="flex items-center justify-between">
        <p className="text-xs opacity-80">差额</p>
        <Icon size={16} />
      </div>
      <p className="mt-1 text-2xl font-semibold tnum tracking-tight md:text-3xl">
        {over ? '+' : ''}{formatCurrency(diff)}
      </p>
      <p className="mt-0.5 text-[11px] opacity-70">
        {over ? '实际超出预算' : under ? '较预算节省' : '与预算一致'}
      </p>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  fixed: '固定支出',
  installment: '分期',
  plan: '购物计划',
};
