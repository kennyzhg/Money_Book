import { useState, useCallback } from 'react';
import { deleteTransaction } from '@/api/transactions';

interface UseDeleteTransactionOptions {
  /** 删除成功后的回调（如从本地列表移除、刷新数据等） */
  onSuccess?: (id: string) => void;
  /** 删除失败后的回调 */
  onError?: (message: string) => void;
  /** 确认提示文案 */
  confirmText?: string;
}

interface UseDeleteTransactionReturn {
  /** 当前正在删除的交易 ID */
  deletingId: string | null;
  /** 删除交易（已内置 confirm 确认和错误处理） */
  remove: (id: string) => Promise<void>;
}

/**
 * 删除交易的统一 Hook
 *
 * 封装了确认弹窗、loading 状态管理、错误处理。
 * 组件只需关注 onSuccess / onError 回调即可。
 */
export function useDeleteTransaction(
  options: UseDeleteTransactionOptions = {},
): UseDeleteTransactionReturn {
  const { onSuccess, onError, confirmText = '确定删除这笔交易？' } = options;
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm(confirmText)) return;
      setDeletingId(id);
      try {
        await deleteTransaction(id);
        onSuccess?.(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '删除失败';
        onError?.(msg);
      } finally {
        setDeletingId(null);
      }
    },
    [onSuccess, onError, confirmText],
  );

  return { deletingId, remove };
}
