import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import type { MonthOverview } from '@shared/types';
import { formatCompact, formatCurrency, formatMonthLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MonthlyTrendChartProps {
  data: MonthOverview[];
}

/** 月份短标签：2026-07 → 7月 */
function shortMonth(month: string): string {
  const [, m] = month.split('-');
  return `${Number(m)}月`;
}

interface ChartDatum {
  /** 原始月份 "2026-07" */
  month: string;
  /** X 轴短标签 "7月" */
  name: string;
  收入: number;
  支出: number;
  /** 图表绘制用：结余 clamp 到非负（负数显示为 0） */
  结余: number;
  /** 真实结余，仅用于 Tooltip 展示，保证数据准确 */
  rawBalance: number;
}

/* ============== 三条折线的视觉配置 ============== */
interface SeriesConfig {
  key: '收入' | '支出' | '结余';
  /** 主色（折线 + 圆点） */
  color: string;
  /** 渐变填充区域（柔和） */
  areaColor: string;
}

const SERIES: SeriesConfig[] = [
  {
    key: '收入',
    color: '#059669', // emerald-600
    areaColor: '#34d399',
  },
  {
    key: '支出',
    color: '#e11d48', // rose-600
    areaColor: '#fb7185',
  },
  {
    key: '结余',
    color: '#4f46e5', // indigo-600
    areaColor: '#818cf8',
  },
];

/* ============== 自定义图例（可点击切换显示） ============== */
function CustomLegend({
  totals,
  hidden,
  onToggle,
}: {
  totals: Record<string, number>;
  hidden: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-3">
      {SERIES.map((s) => {
        const active = !hidden.has(s.key);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onToggle(s.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 transition-all',
              active ? 'opacity-100' : 'opacity-40 hover:opacity-70',
            )}
            aria-pressed={active}
          >
            <span className="relative flex h-3 w-4 items-center justify-center">
              <span
                className="h-[3px] w-full rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span
                className="absolute h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
            </span>
            <span className="text-xs font-medium text-slate-700">{s.key}</span>
            <span className="tnum text-xs text-slate-400">
              {formatCurrency(totals[s.key] ?? 0)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ============== 自定义 Tooltip ============== */
interface TooltipPayloadEntry {
  dataKey?: string | number;
  value?: number;
  color?: string;
  payload?: ChartDatum;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const datum = payload[0]?.payload;
  if (!datum) return null;

  const monthLabel = formatMonthLabel(datum.month);
  const rawBalance = datum.rawBalance;
  const isDeficit = rawBalance < 0;
  const isBreakEven = rawBalance === 0;
  const savingRate =
    datum.收入 > 0 ? Math.round((rawBalance / datum.收入) * 100) : 0;

  const seriesColor = (key: string) =>
    SERIES.find((s) => s.key === key)?.color ?? '#64748b';

  return (
    <div
      className={cn(
        'min-w-[220px] overflow-hidden rounded-xl border bg-white shadow-lg',
        isDeficit ? 'border-rose-200' : isBreakEven ? 'border-slate-200' : 'border-emerald-200',
      )}
    >
      {/* 头部：月份 + 盈亏 badge */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2',
          isDeficit
            ? 'bg-rose-50/80'
            : isBreakEven
              ? 'bg-slate-50'
              : 'bg-emerald-50/80',
        )}
      >
        <span className="text-xs font-semibold text-slate-700">{monthLabel}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            isDeficit
              ? 'bg-rose-100 text-rose-700'
              : isBreakEven
                ? 'bg-slate-100 text-slate-600'
                : 'bg-emerald-100 text-emerald-700',
          )}
        >
          {isDeficit ? '亏空' : isBreakEven ? '持平' : '盈余'}
        </span>
      </div>
      {/* 明细 */}
      <div className="space-y-1.5 px-3 py-2.5">
        <TooltipRow label="收入" value={datum.收入} color={seriesColor('收入')} sign="+" />
        <TooltipRow label="支出" value={datum.支出} color={seriesColor('支出')} sign="-" />
        <div className="my-1 border-t border-slate-100" />
        {/* 结余：展示真实值，亏空时额外标注 */}
        <TooltipRow
          label="结余"
          value={rawBalance}
          color={isDeficit ? '#e11d48' : '#059669'}
          bold
        />
        {isDeficit && (
          <p className="text-[10px] text-rose-500">
            * 图表中显示为 0，此处为实际数值
          </p>
        )}
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[11px] text-slate-400">储蓄率</span>
          <span
            className={cn(
              'tnum text-[11px] font-medium',
              savingRate < 0 ? 'text-rose-600' : 'text-slate-600',
            )}
          >
            {savingRate}%
          </span>
        </div>
      </div>
    </div>
  );
}

function TooltipRow({
  label,
  value,
  color,
  sign,
  bold,
}: {
  label: string;
  value: number;
  color: string;
  sign?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span
        className={cn(
          'tnum text-xs',
          bold ? 'font-semibold text-slate-800' : 'text-slate-700',
        )}
      >
        {sign ? `${sign} ` : ''}
        {formatCurrency(value)}
      </span>
    </div>
  );
}

/* ============== 主组件 ============== */
export default function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  // 图例开关：点击可隐藏对应系列
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!data || data.length === 0) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 text-slate-400">
        <span className="text-sm">暂无年度数据</span>
      </div>
    );
  }

  const chartData: ChartDatum[] = data.map((d) => {
    const rawBalance = d.balance;
    return {
      month: d.month,
      name: shortMonth(d.month),
      收入: d.income,
      支出: d.expense,
      // 结余为负时图表显示为 0，移除下半部分区域
      结余: Math.max(0, rawBalance),
      rawBalance,
    };
  });

  // 合计用于图例（结余用真实值合计，保证数据准确）
  const totals: Record<string, number> = {
    收入: chartData.reduce((s, d) => s + d.收入, 0),
    支出: chartData.reduce((s, d) => s + d.支出, 0),
    结余: chartData.reduce((s, d) => s + d.rawBalance, 0),
  };

  return (
    <div className="flex h-56 flex-col md:h-72">
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 12, bottom: 4, left: -8 }}
          >
          <defs>
            {/* 三条折线下方的柔和渐变填充，增强层次感。
                id 基于颜色 hex 生成，保证唯一且与 SERIES 对应。 */}
            {SERIES.map((s) => (
              <linearGradient
                key={`grad-${s.areaColor}`}
                id={`area-${s.areaColor.replace('#', '')}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.areaColor} stopOpacity={0.2} />
                <stop offset="100%" stopColor={s.areaColor} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />

          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatCompact(v)}
            width={56}
            // 图表不显示负数区域，Y 轴从 0 起
            domain={[0, 'auto']}
            allowDecimals={false}
          />

          <Tooltip
            cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={<CustomTooltip />}
            isAnimationActive={false}
          />

          {/* 三条折线：统一 Area 风格，仅颜色不同。
              Area = 折线 + 下方柔和填充，三层叠加形成清晰的趋势对比。 */}
          {SERIES.map((s) =>
            hidden.has(s.key) ? null : (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2.5}
                fill={`url(#area-${s.areaColor.replace('#', '')})`}
                dot={{
                  r: 3.5,
                  fill: '#fff',
                  stroke: s.color,
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: s.color,
                  stroke: '#fff',
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            ),
          )}
        </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="shrink-0">
        <CustomLegend totals={totals} hidden={hidden} onToggle={toggle} />
      </div>
    </div>
  );
}
