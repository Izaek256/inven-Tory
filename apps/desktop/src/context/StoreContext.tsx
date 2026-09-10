import { createContext, useContext } from 'react';
import { useAppState } from '../hooks/useAppState';

interface StoreContextValue {
  activeStoreId: string | null;
  setActiveStoreId: (storeId: string | null) => void;
}

const StoreContext = createContext<StoreContextValue>({
  activeStoreId: null,
  setActiveStoreId: () => {},
});

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeStoreId, setActiveStoreId } = useAppState();
  return (
    <StoreContext.Provider value={{ activeStoreId, setActiveStoreId }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useActiveStore = (): StoreContextValue => useContext(StoreContext);
