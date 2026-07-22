import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { StatItem } from '@shared/types';
import { formatCurrency } from '@/lib/format';
import { getIcon } from '@/lib/icons';
import { PieChart as PieIcon } from 'lucide-react';

interface CategoryPieChartProps {
  data: StatItem[];
  totalExpense: number;
}

const COLORS = [
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#06b6d4',
  '#14b8a6',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#84cc16',
];

export default function CategoryPieChart({ data, totalExpense }: CategoryPieChartProps) {
  if (!data || data.length === 0) {
    return <EmptyChart icon={PieIcon} text="本月暂无支出数据" />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="relative h-56 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number, n: string) => [formatCurrency(v), n]}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-slate-400">总支出</span>
          <span className="text-base font-semibold tnum text-slate-900 md:text-lg">
            {formatCurrency(totalExpense)}
          </span>
        </div>
      </div>

      <div className="flex flex-col justify-start gap-1.5 md:gap-2">
        {data.map((d, i) => {
          const Icon = getIcon(d.icon);
          const pct = totalExpense > 0 ? (d.value / totalExpense) * 100 : 0;
          return (
            <div key={d.name} className="flex items-center gap-2 text-sm md:gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white md:h-7 md:w-7"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              >
                <Icon size={12} className="md:size-[14px]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-700">{d.name}</span>
              <span className="tnum shrink-0 text-xs text-slate-500 md:text-sm">{pct.toFixed(1)}%</span>
              <span className="tnum w-20 shrink-0 text-right text-xs font-medium text-slate-900 md:w-24 md:text-sm">
                {formatCurrency(d.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyChart({ icon: Icon, text }: { icon: typeof PieIcon; text: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
      <Icon size={36} className="text-slate-300" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
