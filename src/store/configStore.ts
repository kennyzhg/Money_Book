import { create } from 'zustand';
import type { AppConfig, IconItem } from '@shared/types';
import { fetchConfig } from '@/api/config';

interface ConfigState {
  config: AppConfig | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<AppConfig>;
}

const emptyConfig: AppConfig = {
  categories: { income: [], expense: [] },
  paymentMethods: [],
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,
  loaded: false,
  error: null,
  async load(force = false) {
    if (get().loaded && !force && get().config) return get().config as AppConfig;
    set({ loading: true, error: null });
    try {
      const config = await fetchConfig();
      set({ config, loading: false, loaded: true });
      return config;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载配置失败';
      set({ loading: false, error: msg, loaded: true });
      throw e;
    }
  },
}));

export function selectCategories(
  config: AppConfig | null,
  type: 'income' | 'expense',
): IconItem[] {
  return config?.categories[type] ?? emptyConfig.categories[type];
}

export function selectPaymentMethods(config: AppConfig | null): IconItem[] {
  return config?.paymentMethods ?? emptyConfig.paymentMethods;
}
