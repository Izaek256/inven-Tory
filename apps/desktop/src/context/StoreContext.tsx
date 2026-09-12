import React, { createContext, useContext } from 'react';

interface StoreContextValue {
  activeStoreId: string | null;
  setActiveStoreId: (storeId: string | null) => void;
}

const StoreContext = createContext<StoreContextValue>({
  activeStoreId: null,
  setActiveStoreId: () => {},
});

interface StoreProviderProps {
  children: React.ReactNode;
  activeStoreId: string | null;
  setActiveStoreId: (storeId: string | null) => void;
}

export const StoreProvider: React.FC<StoreProviderProps> = ({
  children,
  activeStoreId,
  setActiveStoreId,
}) => {
  return (
    <StoreContext.Provider value={{ activeStoreId, setActiveStoreId }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useActiveStore = (): StoreContextValue => useContext(StoreContext);
