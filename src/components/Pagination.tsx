import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  /** 当前页（从 1 开始） */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 总记录数 */
  total: number;
  /** 页码变化回调 */
  onChange: (page: number) => void;
  className?: string;
}

/**
 * 分页组件
 *
 * 行为约定（与产品需求对齐）：
 *  - 由调用方决定是否渲染（总条数 <= pageSize 时调用方应不渲染本组件）
 *  - 显示："共 X ��� · 第 N / M 页"、上一页、页码、下一页
 *  - 页码显示策略：始终显示首末页；中间显示当前页 ±1；超过 7 个用省略号
 *  - 移动端紧凑显示：仅上一页 / 页码 / 下一页，无数字按钮组
 */
export default function Pagination({
  page,
  pageSize,
  total,
  onChange,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 计算要显示的页码（桌面端）
  const pages = useMemo(() => {
    const window = 1; // 当前页左右各显示 1 页
    const set = new Set<number>([1, totalPages, page]);
    for (let i = page - window; i <= page + window; i++) {
      if (i >= 1 && i <= totalPages) set.add(i);
    }
    const sorted = Array.from(set).sort((a, b) => a - b);
    // 用 0 表示省略号占位（前后差 >1 时插入）
    const result: number[] = [];
    sorted.forEach((p, idx) => {
      if (idx > 0 && p - sorted[idx - 1] > 1) result.push(0);
      result.push(p);
    });
    return result;
  }, [page, totalPages]);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const go = (p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    onChange(p);
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-slate-500',
        className,
      )}
    >
      <span className="tnum">
        共 <span className="font-medium text-slate-700">{total}</span> 条 · 第{' '}
        <span className="font-medium text-slate-700">{page}</span> / {totalPages} 页
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={() => go(page - 1)}
          disabled={!canPrev}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="上一页"
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">上一页</span>
        </button>

        {/* 桌面端：数字页码 */}
        <div className="hidden items-center gap-1 md:flex">
          {pages.map((p, idx) =>
            p === 0 ? (
              <span key={`gap-${idx}`} className="px-1 text-slate-300">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => go(p)}
                className={cn(
                  'tnum inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors',
                  p === page
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>

        {/* 移动端：紧凑页码显示（不渲染按钮组，靠左右按钮切换） */}
        <span className="tnum px-2 text-slate-500 md:hidden">
          {page} / {totalPages}
        </span>

        <button
          onClick={() => go(page + 1)}
          disabled={!canNext}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="下一页"
        >
          <span className="hidden sm:inline">下一页</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
