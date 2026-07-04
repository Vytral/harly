"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

type StickyBarContextType = {
  /** Whether a sticky action bar is currently visible. */
  stickyBarVisible: boolean;
  /** Call this from any component that has a sticky bar. */
  setStickyBarVisible: (visible: boolean) => void;
};

const StickyBarContext = createContext<StickyBarContextType>({
  stickyBarVisible: false,
  setStickyBarVisible: () => {},
});

export function useStickyBar() {
  return useContext(StickyBarContext);
}

export function StickyBarProvider({ children }: { children: ReactNode }) {
  const [stickyBarVisible, setStickyBarVisible] = useState(false);
  const handleSet = useCallback((visible: boolean) => setStickyBarVisible(visible), []);
  const value = useMemo(() => ({ stickyBarVisible, setStickyBarVisible: handleSet }), [stickyBarVisible, handleSet]);

  return (
    <StickyBarContext.Provider value={value}>
      {children}
    </StickyBarContext.Provider>
  );
}
