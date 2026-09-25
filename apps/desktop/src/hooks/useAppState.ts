import { useCallback, useTransition, useMemo } from 'react';
import { usePersistentState } from './usePersistentState';
import type { NavView } from '../config/navigation';

const APP_STATE_KEY = 'inven_tory_app_state_v1';

interface AppPersistentState {
  currentView: NavView;
  activeStoreId: string | null;
}

const DEFAULT_STATE: AppPersistentState = {
  currentView: 'dashboard',
  activeStoreId: null,
};

const cachedState: Record<string, AppPersistentState | null> = {};
let stateVersion = 0;

function _getCachedState(): AppPersistentState | null {
  return cachedState[APP_STATE_KEY] ?? null;
}

function _setCachedState(state: AppPersistentState): void {
  cachedState[APP_STATE_KEY] = state;
  stateVersion++;
}

export function useAppState() {
  const [state, setState, resetState] = usePersistentState<AppPersistentState>(
    APP_STATE_KEY,
    DEFAULT_STATE,
  );
  const [isPending, startTransition] = useTransition();

  const memoizedState = useMemo(() => state, [state.currentView, state.activeStoreId]);

  const setCurrentView = useCallback(
    (view: NavView | ((prev: NavView) => NavView)): void => {
      startTransition(() => {
        setState((prev) => {
          const next = {
            ...prev,
            currentView: typeof view === 'function' ? view(prev.currentView) : view,
          };
          _setCachedState(next);
          return next;
        });
      });
    },
    [setState],
  );

  const setActiveStoreId = useCallback(
    (storeId: string | null | ((prev: string | null) => string | null)): void => {
      startTransition(() => {
        setState((prev) => {
          const next = {
            ...prev,
            activeStoreId:
              typeof storeId === 'function'
                ? (storeId as (prev: string | null) => string | null)(prev.activeStoreId)
                : storeId,
          };
          _setCachedState(next);
          return next;
        });
      });
    },
    [setState],
  );

  const resetStateMemo = useCallback(() => {
    startTransition(() => {
      resetState();
      _setCachedState(DEFAULT_STATE);
    });
  }, [resetState]);

  const getCachedState = useCallback((): AppPersistentState | null => {
    return _getCachedState();
  }, []);

  return {
    currentView: memoizedState.currentView,
    activeStoreId: memoizedState.activeStoreId,
    setCurrentView,
    setActiveStoreId,
    resetState: resetStateMemo,
    isPending,
    getCachedState,
  };
}
