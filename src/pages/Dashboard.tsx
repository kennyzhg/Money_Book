import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PiggyBank,
  TrendingUp,
  TrendingDown,
  PieChart as PieIcon,
  BarChart3,
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CalendarRange,
  ListChecks,
} from 'lucide-react';
import type { MonthlyStats, OverviewStats } from '@shared/types';
import { fetchMonthlyStats, fetchOverview } from '@/api/statistics';
import { createTransaction } from '@/api/transactions';
import { currentMonth, formatCurrency, formatMonthLabel, getRecentMonths } from '@/lib/format';
import { useConfigStore } from '@/store/configStore';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/lib/useIsMobile';
import PageHeader from '@/components/PageHeader';
import SummaryCard from '@/components/SummaryCard';
import CategoryPieChart from '@/components/charts/CategoryPieChart';
import PaymentBarChart from '@/components/charts/PaymentBarChart';
import MonthlyTrendChart from '@/components/charts/MonthlyTrendChart';
import MonthTransactionsList from '@/components/MonthTransactionsList';
import TransactionFormModal from '@/components/TransactionFormModal';
import Select from '@/components/Select';

type ViewTab = 'annual' | 'monthly';

export default function Dashboard() {
  // 默认年度视图
  const [tab, setTab] = useState<ViewTab>('annual');
  const [modalOpen, setModalOpen] = useState(false);
  const { load: loadConfig } = useConfigStore();

  useEffect(() => {
    loadConfig().catch(() => undefined);
  }, [loadConfig]);

  return (
    <div>
      <PageHeader
        title="仪表盘"
        subtitle="收支概览与消费结构分析"
        actions={
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 md:w-auto"
          >
            <Plus size={16} />
            记一笔
          </button>
        }
      />

      {/* Tab 切换：移动端占满宽度 */}
      <div className="mb-4 inline-flex w-full rounded-xl bg-slate-100 p-1 md:mb-6 md:w-auto">
        <TabButton
          active={tab === 'annual'}
          onClick={() => setTab('annual')}
          icon={<CalendarRange size={15} />}
          label="年度"
        />
        <TabButton
          active={tab === 'monthly'}
          onClick={() => setTab('monthly')}
          icon={<Calendar size={15} />}
          label="月度"
        />
      </div>

      {tab === 'annual' ? (
        <AnnualView />
      ) : (
        <MonthlyView />
      )}

      <TransactionFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={async (input) => {
          await createTransaction(input);
          // 触发当前视图重新加载（通过 key 变化或内部 reload）
          window.dispatchEvent(new CustomEvent('transaction:changed'));
        }}
      />
    </div>
  );
}

// ============== Tab 按钮 ==============
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}
function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all md:flex-none',
        active
          ? 'bg-white text-blue-600 shadow-sm'
          : 'text-slate-500 hover:text-slate-700',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ============== 年度视图 ==============
function AnnualView() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const reload = () => {
    setLoading(true);
    setError(null);
    fetchOverview()
      .then(setOverview)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener('transaction:changed', onChange);
    return () => window.removeEventListener('transaction:changed', onChange);
  }, []);

  if (error) {
    return <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>;
  }
  if (loading || !overview) {
    return <DashboardSkeleton />;
  }

  const yearLabel = overview.months[0]?.month?.slice(0, 4) ?? new Date().getFullYear();
  // 年度储蓄率
  const savingRate =
    overview.yearIncome > 0
      ? Math.round((overview.yearBalance / overview.yearIncome) * 100)
      : 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* 三张摘要卡 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        <SummaryCard
          label="年度收入"
          amount={overview.yearIncome}
          icon={TrendingUp}
          tone="emerald"
          hint={`${yearLabel} 年`}
        />
        <SummaryCard
          label="年度支出"
          amount={overview.yearExpense}
          icon={TrendingDown}
          tone="rose"
          hint={`${yearLabel} 年`}
        />
        <SummaryCard
          label="年度结余"
          amount={overview.yearBalance}
          icon={PiggyBank}
          tone="blue"
          hint={`储蓄率 ${savingRate}%`}
        />
      </div>

      {/* 月度趋势图 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-900">月度收支趋势</h2>
        </div>
        <MonthlyTrendChart data={overview.months} />
        <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-400">
          绿线为收入、红线为支出、靛蓝线为结余；结余为负时图表显示为 0，悬停可查看实际数值。点击图例可切换显示。
        </p>
      </section>

      {/* 年度支出结构图表 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <ChartCard
          title="支出分类占比"
          icon={<PieIcon size={16} className="text-blue-600" />}
          caption="按消费分类汇总的年度支出占比"
        >
          <CategoryPieChart
            data={overview.expenseByCategory}
            totalExpense={overview.yearExpense}
          />
        </ChartCard>
        <ChartCard
          title="支付方式支出分布"
          icon={<BarChart3 size={16} className="text-blue-600" />}
          caption="按支付方式汇总的年度支出金额"
        >
          <PaymentBarChart data={overview.expenseByPaymentMethod} />
        </ChartCard>
      </div>

      {/* 按月明细：桌面端表格，移动端卡片 */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
        <div className="border-b border-slate-100 px-4 py-4 md:px-6">
          <div className="flex items-center gap-2">
            <ListChecks size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">按月汇总明细</h2>
          </div>
        </div>
        {isMobile ? (
          <MonthlySummaryCards months={[...overview.months].reverse()} yearTotals={{
            yearIncome: overview.yearIncome,
            yearExpense: overview.yearExpense,
            yearBalance: overview.yearBalance,
            savingRate,
          }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-6 py-3 font-medium">月份</th>
                  <th className="px-6 py-3 text-right font-medium">收入</th>
                  <th className="px-6 py-3 text-right font-medium">支出</th>
                  <th className="px-6 py-3 text-right font-medium">结余</th>
                  <th className="px-6 py-3 text-right font-medium">储蓄率</th>
                </tr>
              </thead>
              <tbody>
                {[...overview.months].reverse().map((m) => {
                  const rate = m.income > 0 ? Math.round((m.balance / m.income) * 100) : 0;
                  return (
                    <tr
                      key={m.month}
                      className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="whitespace-nowrap px-6 py-3 text-slate-700">
                        {formatMonthLabel(m.month)}
                      </td>
                      <td className="tnum px-6 py-3 text-right text-emerald-600">
                        {formatCurrency(m.income)}
                      </td>
                      <td className="tnum px-6 py-3 text-right text-rose-600">
                        {formatCurrency(m.expense)}
                      </td>
                      <td
                        className={cn(
                          'tnum px-6 py-3 text-right font-medium',
                          m.balance >= 0 ? 'text-slate-900' : 'text-rose-600',
                        )}
                      >
                        {formatCurrency(m.balance)}
                      </td>
                      <td className="tnum px-6 py-3 text-right text-slate-500">{rate}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-100 bg-slate-50/50 text-xs font-semibold">
                  <td className="px-6 py-3 text-slate-700">合计</td>
                  <td className="tnum px-6 py-3 text-right text-emerald-600">
                    {formatCurrency(overview.yearIncome)}
                  </td>
                  <td className="tnum px-6 py-3 text-right text-rose-600">
                    {formatCurrency(overview.yearExpense)}
                  </td>
                  <td className="tnum px-6 py-3 text-right text-slate-900">
                    {formatCurrency(overview.yearBalance)}
                  </td>
                  <td className="tnum px-6 py-3 text-right text-slate-700">{savingRate}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ============== 月度视图 ==============
function MonthlyView() {
  const [month, setMonth] = useState<string>(currentMonth());
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const months = useMemo(() => getRecentMonths(12), []);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMonthlyStats(month)
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [month]);

  // 月份变化或"记一笔"成功后刷新当前视图
  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener('transaction:changed', onChange);
    return () => window.removeEventListener('transaction:changed', onChange);
  }, [reload]);

  const shiftMonth = (delta: number) => {
    const idx = months.indexOf(month);
    if (idx === -1) return;
    const next = months[idx + delta];
    if (next) setMonth(next);
  };
  const canGoPrev = months.indexOf(month) < months.length - 1;
  const canGoNext = months.indexOf(month) > 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* 月份选择 */}
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={() => shiftMonth(1)}
          disabled={!canGoPrev}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          title="上一月"
          aria-label="上一月"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1 md:min-w-[160px] md:flex-none">
          <Select value={month} onChange={setMonth} className="w-full">
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </Select>
        </div>
        <button
          onClick={() => shiftMonth(-1)}
          disabled={!canGoNext}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          title="下一月"
          aria-label="下一月"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {error ? (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
      ) : loading || !stats ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* 三张摘要卡 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
            <SummaryCard
              label="本月收入"
              amount={stats.totalIncome}
              icon={TrendingUp}
              tone="emerald"
              hint={formatMonthLabel(stats.month)}
            />
            <SummaryCard
              label="本月支出"
              amount={stats.totalExpense}
              icon={TrendingDown}
              tone="rose"
              hint={formatMonthLabel(stats.month)}
            />
            <SummaryCard
              label="本月结余"
              amount={stats.balance}
              icon={PiggyBank}
              tone="blue"
              hint={formatMonthLabel(stats.month)}
            />
          </div>

          {/* 两张图表 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            <ChartCard
              title="支出分类占比"
              icon={<PieIcon size={16} className="text-blue-600" />}
              caption="按消费分类汇总的当月支出占比"
            >
              <CategoryPieChart
                data={stats.expenseByCategory}
                totalExpense={stats.totalExpense}
              />
            </ChartCard>
            <ChartCard
              title="支付方式支出分布"
              icon={<BarChart3 size={16} className="text-blue-600" />}
              caption="按支付方式汇总的当月支出金额"
            >
              <PaymentBarChart data={stats.expenseByPaymentMethod} />
            </ChartCard>
          </div>

          {/* 月度账单明细 */}
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 md:px-6">
              <div className="flex items-center gap-2">
                <ListChecks size={16} className="text-blue-600" />
                <h2 className="text-sm font-semibold text-slate-900">
                  {formatMonthLabel(month)} 账单明细
                </h2>
              </div>
              <a
                href="/transactions"
                className="text-xs text-blue-600 underline-offset-2 hover:underline"
              >
                查看全部 →
              </a>
            </div>
            <div className="px-4 py-2 md:px-6">
              <MonthTransactionsList month={month} maxItems={10} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ============== 移动端：月度汇总卡片 ============== */
interface MonthlySummaryCardsProps {
  months: Array<{ month: string; income: number; expense: number; balance: number }>;
  yearTotals: {
    yearIncome: number;
    yearExpense: number;
    yearBalance: number;
    savingRate: number;
  };
}

function MonthlySummaryCards({ months, yearTotals }: MonthlySummaryCardsProps) {
  return (
    <div className="p-3">
      <ul className="space-y-2">
        {months.map((m) => {
          const rate = m.income > 0 ? Math.round((m.balance / m.income) * 100) : 0;
          return (
            <li
              key={m.month}
              className="rounded-xl border border-slate-100 bg-slate-50/40 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">
                  {formatMonthLabel(m.month)}
                </span>
                <span
                  className={cn(
                    'tnum text-xs',
                    m.balance >= 0 ? 'text-slate-500' : 'text-rose-500',
                  )}
                >
                  储蓄率 {rate}%
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-slate-400">收入</p>
                  <p className="tnum font-medium text-emerald-600">
                    {formatCurrency(m.income)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">支出</p>
                  <p className="tnum font-medium text-rose-600">
                    {formatCurrency(m.expense)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">结余</p>
                  <p
                    className={cn(
                      'tnum font-medium',
                      m.balance >= 0 ? 'text-slate-900' : 'text-rose-600',
                    )}
                  >
                    {formatCurrency(m.balance)}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 年度合计 — 与月度卡片同一层级风格 */}
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-100/60 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="h-3.5 w-1 rounded-full bg-blue-500" />
          <p className="text-xs font-semibold text-slate-700">年度合计</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-slate-400">收入</p>
            <p className="tnum font-semibold text-emerald-600">
              {formatCurrency(yearTotals.yearIncome)}
            </p>
          </div>
          <div>
            <p className="text-slate-400">支出</p>
            <p className="tnum font-semibold text-rose-600">
              {formatCurrency(yearTotals.yearExpense)}
            </p>
          </div>
          <div>
            <p className="text-slate-400">结余 / 储蓄率</p>
            <p className="tnum font-semibold text-slate-900">
              {formatCurrency(yearTotals.yearBalance)} / {yearTotals.savingRate}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  icon: React.ReactNode;
  caption: string;
  children: React.ReactNode;
}

function ChartCard({ title, icon, caption, children }: ChartCardProps) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      {children}
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">{caption}</p>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-2xl bg-white ring-1 ring-slate-100"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-96 animate-pulse rounded-2xl bg-white ring-1 ring-slate-100"
          />
        ))}
      </div>
    </div>
  );
}
