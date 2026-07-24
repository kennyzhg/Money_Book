import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Loader2,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { MonthlyBudgetReport, YearlyBudgetReport } from '@shared/types';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Select from '@/components/Select';
import CategoryIcon from '@/components/CategoryIcon';
import { fetchBudgetMonthly, fetchBudgetYearly } from '@/api/bills';
import {
  currentMonth,
  currentYear,
  formatCurrency,
  formatCompact,
  formatMonthLabel,
  getRecentMonths,
  getRecentYears,
} from '@/lib/format';
import { cn } from '@/lib/utils';

type View = 'monthly' | 'yearly';

export default function Reports() {
  const [view, setView] = useState<View>('monthly');

  return (
    <div>
      <PageHeader title="预算对比报表" subtitle="预计支出 vs 实际支出 —— 看清每一项的差异" />

      <div className="mb-4 inline-flex w-full rounded-xl bg-slate-100 p-1 md:mb-6 md:w-auto">
        <button
          onClick={() => setView('monthly')}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all md:flex-none',
            view === 'monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          月度
        </button>
        <button
          onClick={() => setView('yearly')}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all md:flex-none',
            view === 'yearly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          年度
        </button>
      </div>

      {view === 'monthly' ? <MonthlyView /> : <YearlyView />}
    </div>
  );
}

// ============================================================
// 月度视图
// ============================================================
function MonthlyView() {
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<MonthlyBudgetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchBudgetMonthly(month));
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
    <div className="space-y-4 md:space-y-6">
      {/* 月份选择 */}
      <div className="flex items-center gap-2">
        <button onClick={() => shift(-1)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50">
          <ChevronLeft size={16} />
        </button>
        <div className="relative flex-1 md:flex-none">
          <Select value={month} onChange={setMonth} className="min-w-[140px]">
            {getRecentMonths(12).map((m) => (
              <option key={m} value={m}>{formatMonthLabel(m)}</option>
            ))}
          </Select>
        </div>
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
      ) : report ? (
        <>
          {/* 汇总卡片 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <SummaryTile label="预计支出" amount={report.projectedExpense} tone="slate" />
            <SummaryTile label="实际支出" amount={report.actualExpense} tone="blue" />
            <DiffTile diff={report.diff} />
          </div>

          {/* 可视化：柱状对比 */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">预计 vs 实际</h3>
            <BudgetBarChart projected={report.projectedExpense} actual={report.actualExpense} />
          </div>

          {/* 明细对比表 */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">预计明细</h3>
            {report.projectedItems.length === 0 ? (
              <EmptyState icon={BarChart3} title="本月暂无预计支出" hint="去「财务规划」添加固定支出、分期或购物计划" />
            ) : (
              <div className="divide-y divide-slate-100">
                {report.projectedItems.map((it) => (
                  <div key={`${it.source}-${it.refId}`} className="flex items-center gap-3 py-2.5">
                    <CategoryIcon icon={it.icon} size={14} className="h-7 w-7" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{it.name}</p>
                      <p className="text-xs text-slate-400">
                        {it.category} · {SOURCE_LABEL[it.source]}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tnum text-slate-900">{formatCurrency(it.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">实际支出（按分类）</h3>
            {report.actualItems.length === 0 ? (
              <EmptyState icon={BarChart3} title="本月暂无实际支出" />
            ) : (
              <div className="divide-y divide-slate-100">
                {report.actualItems.map((it) => (
                  <div key={it.category} className="flex items-center gap-3 py-2.5">
                    <CategoryIcon icon={it.icon} size={14} className="h-7 w-7" tone="expense" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{it.category}</p>
                      <p className="text-xs text-slate-400">{it.count} 笔</p>
                    </div>
                    <span className="text-sm font-semibold tnum text-slate-900">{formatCurrency(it.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// 年度视图
// ============================================================
function YearlyView() {
  const [year, setYear] = useState(currentYear());
  const [report, setReport] = useState<YearlyBudgetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchBudgetYearly(year)
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [year]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">年份</span>
        <Select value={year} onChange={setYear} className="min-w-[100px]">
          {getRecentYears(5).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-600">{error}</div>
      ) : report ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <SummaryTile label="全年预计" amount={report.projectedExpense} tone="slate" />
            <SummaryTile label="全年实际" amount={report.actualExpense} tone="blue" />
            <DiffTile diff={report.diff} />
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">逐月对比</h3>
            {report.months.length === 0 ? (
              <EmptyState icon={BarChart3} title="该年暂无数据" />
            ) : (
              <YearlyTrendChart months={report.months} />
            )}
          </div>

          {report.months.length > 0 && (
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">各月明细</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                      <th className="pb-2 pr-3 font-medium">月份</th>
                      <th className="pb-2 pr-3 text-right font-medium">预计</th>
                      <th className="pb-2 pr-3 text-right font-medium">实际</th>
                      <th className="pb-2 text-right font-medium">差额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {report.months.map((m) => (
                      <tr key={m.month}>
                        <td className="py-2.5 pr-3 text-slate-700">{formatMonthLabel(m.month)}</td>
                        <td className="py-2.5 pr-3 text-right tnum text-slate-600">{formatCurrency(m.projectedExpense)}</td>
                        <td className="py-2.5 pr-3 text-right tnum text-slate-900">{formatCurrency(m.actualExpense)}</td>
                        <td className={cn('py-2.5 text-right tnum font-medium', m.diff > 0 ? 'text-rose-600' : m.diff < 0 ? 'text-emerald-600' : 'text-slate-400')}>
                          {m.diff > 0 ? '+' : ''}{formatCurrency(m.diff)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// 可视化与卡片
// ============================================================
function BudgetBarChart({ projected, actual }: { projected: number; actual: number }) {
  const data = [{ name: '本月', 预计: projected, 实际: actual }];
  return (
    <div className="h-56 md:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="projBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <linearGradient id="actBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompact(v)} width={56} />
          <Tooltip
            cursor={{ fill: '#f8fafc' }}
            formatter={(v: number, n: string) => [formatCurrency(v), n]}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
          <Bar dataKey="预计" fill="url(#projBar)" radius={[4, 4, 0, 0]} maxBarSize={48} />
          <Bar dataKey="实际" fill="url(#actBar)" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function YearlyTrendChart({ months }: { months: YearlyBudgetReport['months'] }) {
  const data = months.map((m) => ({
    name: `${Number(m.month.slice(5, 7))}月`,
    预计: m.projectedExpense,
    实际: m.actualExpense,
  }));
  return (
    <div className="h-64 md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="yProjBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <linearGradient id="yActBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompact(v)} width={56} />
          <Tooltip
            cursor={{ fill: '#f8fafc' }}
            formatter={(v: number, n: string) => [formatCurrency(v), n]}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
          <Bar dataKey="预计" fill="url(#yProjBar)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="实际" fill="url(#yActBar)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function SummaryTile({ label, amount, tone }: { label: string; amount: number; tone: 'slate' | 'blue' }) {
  const c = tone === 'blue' ? 'text-blue-700' : 'text-slate-700';
  return (
    <div className="animate-fade-in-up rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tnum tracking-tight md:text-3xl', c)}>{formatCurrency(amount)}</p>
    </div>
  );
}

function DiffTile({ diff }: { diff: number }) {
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
