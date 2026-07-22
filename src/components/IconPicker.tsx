import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { PICKABLE_ICON_GROUPS, PICKABLE_ICONS, getIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';

interface IconPickerProps {
  value: string;
  onChange: (name: string) => void;
}

/**
 * 图标选择器：点击展开分组网格，支持搜索。
 *
 * - 输入关键字时，跨分组过滤匹配项；
 * - 默认按"收入 / 餐饮 / 交通 / 购物 ..."分组展示，便于定位；
 * - 当前已选项以蓝色高亮 + 勾选标记呈现。
 */
export default function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const Current = getIcon(value);

  const { filteredGroups, flatFiltered } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        filteredGroups: PICKABLE_ICON_GROUPS,
        flatFiltered: PICKABLE_ICONS,
      };
    }
    const groups = PICKABLE_ICON_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) => it.name.toLowerCase().includes(q) || it.label.includes(q),
      ),
    })).filter((g) => g.items.length > 0);
    return {
      filteredGroups: groups,
      flatFiltered: groups.flatMap((g) => g.items),
    };
  }, [query]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm transition-colors hover:bg-slate-50 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600">
          <Current size={18} />
        </span>
        <span className="flex-1 text-left text-slate-700">{value}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <>
          {/* 点击外部关闭 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full min-w-[280px] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {/* 搜索框 */}
            <div className="relative mb-2">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索图标（如 餐饮 / utensils）"
                className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* 图标分组网格 */}
            {flatFiltered.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">未找到匹配的图标</p>
            ) : (
              <div className="max-h-72 space-y-3 overflow-y-auto scroll-thin">
                {filteredGroups.map((group) => (
                  <div key={group.group}>
                    <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {group.group}
                    </p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {group.items.map((it) => {
                        const Icon = getIcon(it.name);
                        const selected = it.name === value;
                        return (
                          <button
                            key={it.name}
                            type="button"
                            title={`${it.label} (${it.name})`}
                            onClick={() => {
                              onChange(it.name);
                              setOpen(false);
                              setQuery('');
                            }}
                            className={cn(
                              'flex h-12 w-12 items-center justify-center rounded-lg transition-colors',
                              selected
                                ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-300'
                                : 'text-slate-500 hover:bg-slate-100',
                            )}
                          >
                            {selected ? <Check size={22} /> : <Icon size={22} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 底部计数 */}
            <div className="mt-1.5 border-t border-slate-100 px-1 pt-1.5 text-[10px] text-slate-400">
              共 {flatFiltered.length} / {PICKABLE_ICONS.length} 个图标
            </div>
          </div>
        </>
      )}
    </div>
  );
}
