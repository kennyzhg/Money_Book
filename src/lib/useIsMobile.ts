import { useEffect, useState } from 'react';

/**
 * 移动端断点（与 Tailwind 的 `md` 保持一致）
 * - 窗口宽度 < 768px 视为移动端
 * - iPad mini 竖屏 (768) 及以上视为桌面/平板布局
 */
export const MOBILE_BREAKPOINT = 768;

/**
 * 响应式 Hook：根据窗口宽度判断是否为移动端布局。
 *
 * 结合 UA 嗅探与窗口尺寸监听两种方式：
 * - 服务端 / 首屏渲染前通过 UA 猜测初始值，避免布局闪烁
 * - 客户端挂载后以窗口实际宽度为准（更可靠，能响应横竖屏切换、窗口缩放）
 *
 * @param breakpoint 自定义断点，默认 768
 */
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => guessMobile(breakpoint));

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < breakpoint);
    update(); // 挂载时立即同步一次真实窗口宽度

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [breakpoint]);

  return isMobile;
}

/** 通过 UA + 视口宽度猜测是否为移动端（仅用于初始化，避免 SSR/首屏闪烁） */
function guessMobile(breakpoint: number): boolean {
  if (typeof window === 'undefined') return false;
  if (window.innerWidth < breakpoint) return true;

  const ua = navigator.userAgent || '';
  // 触屏 + 小屏的移动设备（iPhone、Android 手机、iPod 等）
  if (/iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) {
    return true;
  }
  // Android 平板/Nexus 平板等通常不带 "Mobile"
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return false;

  return false;
}
