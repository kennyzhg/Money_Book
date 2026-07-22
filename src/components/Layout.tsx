import { Outlet } from 'react-router-dom';
import Sidebar, { MobileTabBar, MobileTopBar } from './Sidebar';

export default function Layout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 md:flex-row">
      {/* 桌面端：左侧固定侧栏；移动端隐藏 */}
      <Sidebar />

      {/* 右侧主体区域：移动端纵向排列（顶栏 + 内容） */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileTopBar />
        <main className="flex-1 overflow-y-auto scroll-thin">
          {/* 桌面端保留宽松间距，移动端紧凑
               底部预留固定 TabBar 高度，避免内容被遮挡 */}
          <div className="mx-auto max-w-7xl px-4 py-4 pb-20 md:px-8 md:py-8 md:pb-8">
            <Outlet />
          </div>
        </main>
      </div>
      {/* 移动端底部 Tab 导航：fixed 固定到视口底部，脱离 flex 流 */}
      <MobileTabBar />
    </div>
  );
}
