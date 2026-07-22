import { cn } from '@/lib/utils';

interface BrandLogoProps {
  /** Tailwind size class，如 "h-10 w-10" */
  className?: string;
  /** 内部 ¥ 符号尺寸（px），默认 20 */
  symbolSize?: number;
  /** 圆角风格，默认 rounded-2xl */
  rounded?: string;
}

/**
 * 记账本品牌徽标：账本 + ¥ 货币符号。
 *
 * 设计意图：
 * - 圆角方形容器呼应现代 App 图标风格；
 * - 渐变蓝（与项目主色 #2563eb 系）；
 * - ¥ 货币符号 + 两条账目横线 = "记账"主题；
 * - 完全 SVG，零依赖，任意尺寸清晰；
 * - 替代项目最初使用的通用 Wallet 图标，提升品牌识别度。
 */
export default function BrandLogo({
  className,
  symbolSize = 20,
  rounded = 'rounded-2xl',
}: BrandLogoProps) {
  return (
    <div
      role="img"
      aria-label="记账本"
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-600/25',
        rounded,
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        width={symbolSize}
        height={symbolSize}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* ¥ 货币符号 */}
        <path d="M11 9 L16 15 L21 9" />
        <path d="M16 15 L16 23" />
        <path d="M12.5 17.5 L19.5 17.5" />
        <path d="M12.5 20 L19.5 20" />
      </svg>
      {/* 装饰：账本脊线（左上斜光） */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent" />
    </div>
  );
}
