import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Receipt, Settings, BookOpenText } from 'lucide-react';
import { cn } from '@/lib/utils';
import BrandLogo from './BrandLogo';

const navItems = [
  { to: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { to: '/transactions', label: '全部账单', icon: Receipt },
  { to: '/admin', label: '管理', icon: Settings },
];

/**
 * 桌面端：固定左侧边栏（≥ md 断点）
 */
export default function Sidebar() {
  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex items-center gap-3 px-6 py-6">
        <BrandLogo className="h-10 w-10" symbolSize={22} />
        <div className="flex flex-col leading-tight">
          <span className="flex items-center gap-1.5 text-base font-semibold text-slate-900">
            <BookOpenText size={14} className="text-blue-500" />
            记账本
          </span>
          <span className="text-xs text-slate-400">Money Tracker</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={18}
                    className={cn(
                      'transition-colors',
                      isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600',
                    )}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-6 py-4">
        <p className="text-xs leading-relaxed text-slate-400">
          RESTful API
          <br />
          <code className="text-slate-500">/api/v1</code>
        </p>
      </div>
    </aside>
  );
}

/**
 * 移动端：底部 Tab 导航（< md 断点）
 * - 固定在屏幕底部，避开 iOS 安全区（通过 env(safe-area-inset-bottom)）
 * - 仅显示图标 + 短标签，点击间距大，适合触屏
 */
export function MobileTabBar() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium transition-colors',
                isActive ? 'text-blue-600' : 'text-slate-500',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={22}
                  className={cn('transition-colors', isActive ? 'text-blue-600' : 'text-slate-400')}
                />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * 移动端：顶部品牌栏（< md 断点）
 * - 高度紧凑，避开 iOS 状态区
 */
export function MobileTopBar() {
  return (
    <header
      className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 md:hidden"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
    >
      <BrandLogo className="h-8 w-8" symbolSize={18} rounded="rounded-lg" />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-slate-900">记账本</span>
      </div>
    </header>
  );
}
