import { useEffect, useState } from 'react';
import type { Transaction } from '@shared/types';
import { fetchTransactions } from '@/api/transactions';
import { useConfigStore } from '@/store/configStore';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDeleteTransaction } from '@/lib/useDeleteTransaction';
import {
  Loader2,
  Inbox,
  Trash2,
} from 'lucide-react';
import CategoryIcon from '@/components/CategoryIcon';
import { getIcon } from '@/lib/icons';

interface MonthTransactionsListProps {
  /** YYYY-MM */
  month: string;
  /** 最大显示条数（默认 10，超出显示"查看全部"链接） */
  maxItems?: number;
}

/**
 * 月度账单明细（用于 Dashboard 月度视图底部）
 * - 简洁列表样式（不是完整表格）
 * - 支持删除（行内）
 * - 仅显示指定月份的交易，按日期倒序
 */
export default function MonthTransactionsList({
  month,
  maxItems = 10,
}: MonthTransactionsListProps) {
  const config = useConfigStore((s) => s.config);
  const [list, setList] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    fetchTransactions({ month })
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const { deletingId, remove: handleDelete } = useDeleteTransaction({
    onSuccess: (id) => setList((prev) => prev.filter((t) => t.id !== id)),
    onError: (msg) => setError(msg),
  });

  const visible = list.slice(0, maxItems);
  const hiddenCount = Math.max(0, list.length - maxItems);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
        <Inbox size={32} className="text-slate-300" />
        <span className="text-sm">本月暂无交易记录</span>
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-slate-50">
        {visible.map((t) => {
          const catIcon =
            config?.categories[t.type].find((c) => c.name === t.category)?.icon ?? 'circle';
          const payIcon =
            config?.paymentMethods.find((p) => p.name === t.paymentMethod)?.icon ?? 'smartphone';
          const PayIcon = getIcon(payIcon);
          return (
            <li
              key={t.id}
              className="group flex items-center gap-3 py-3 transition-colors hover:bg-slate-50/60"
            >
              <CategoryIcon
                icon={catIcon}
                tone={t.type === 'income' ? 'income' : 'expense'}
                size={16}
                className="h-9 w-9 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">
                    {t.category}
                  </span>
                  <span className="hidden text-xs text-slate-400 sm:inline">
                    · {t.paymentMethod}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                  <span className="tnum">{t.date.slice(5)}</span>
                  <PayIcon size={11} className="text-slate-300 sm:hidden" />
                  {t.note && (
                    <span className="truncate">· {t.note}</span>
                  )}
                </div>
              </div>
              <span
                className={cn(
                  'tnum shrink-0 text-sm font-semibold',
                  t.type === 'income' ? 'text-emerald-600' : 'text-slate-900',
                )}
              >
                {t.type === 'income' ? '+' : '-'}
                {formatCurrency(t.amount)}
              </span>
              <button
                onClick={() => handleDelete(t.id)}
                disabled={deletingId === t.id}
                className="shrink-0 rounded-md p-1.5 text-slate-300 opacity-100 transition-all hover:bg-rose-50 hover:text-rose-600 md:opacity-0 md:group-hover:opacity-100 disabled:opacity-50"
                title="删除"
                aria-label="删除"
              >
                {deletingId === t.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-3 text-center">
          <a
            href="/transactions"
            className="text-xs text-blue-600 underline-offset-2 hover:underline"
          >
            查看全部 {list.length} 条记录（还有 {hiddenCount} 条）
          </a>
        </div>
      )}
    </div>
  );
}
