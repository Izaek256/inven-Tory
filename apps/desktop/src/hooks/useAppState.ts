import { useCallback } from 'react';
import { usePersistentState } from './usePersistentState';
import type { NavView } from '../components/Sidebar';

const APP_STATE_KEY = 'inven_tory_app_state_v1';

interface AppPersistentState {
  currentView: NavView;
  activeStoreId: string | null;
}

const DEFAULT_STATE: AppPersistentState = {
  currentView: 'dashboard',
  activeStoreId: null,
};

export function useAppState(): {
  currentView: NavView;
  activeStoreId: string | null;
  setCurrentView: (view: NavView | ((prev: NavView) => NavView)) => void;
  setActiveStoreId: (storeId: string | null | ((prev: string | null) => string | null)) => void;
  resetState: () => void;
} {
  const [state, setState, resetState] = usePersistentState<AppPersistentState>(
    APP_STATE_KEY,
    DEFAULT_STATE,
  );

  const setCurrentView = useCallback(
    (view: NavView | ((prev: NavView) => NavView)): void => {
      setState((prev) => ({
        ...prev,
        currentView: typeof view === 'function' ? view(prev.currentView) : view,
      }));
    },
    [setState],
  );

  const setActiveStoreId = useCallback(
    (storeId: string | null | ((prev: string | null) => string | null)): void => {
      setState((prev) => ({
        ...prev,
        activeStoreId:
          typeof storeId === 'function'
            ? (storeId as (prev: string | null) => string | null)(prev.activeStoreId)
            : storeId,
      }));
    },
    [setState],
  );

  return {
    currentView: state.currentView,
    activeStoreId: state.activeStoreId,
    setCurrentView,
    setActiveStoreId,
    resetState,
  };
}
