"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type PageTitleState = {
  title: string;
  breadcrumb: string | null;
};

const PageTitleContext = createContext<{
  state: PageTitleState;
  set: (s: PageTitleState) => void;
}>({
  state: { title: "", breadcrumb: null },
  set: () => {},
});

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [state, set] = useState<PageTitleState>({
    title: "",
    breadcrumb: null,
  });

  return (
    <PageTitleContext value={{ state, set }}>
      {children}
    </PageTitleContext>
  );
}

export function usePageTitle() {
  return useContext(PageTitleContext).state;
}

export function PageTitle({
  title,
  breadcrumb,
}: {
  title: string;
  breadcrumb?: string;
}) {
  const { set } = useContext(PageTitleContext);

  useEffect(() => {
    set({ title, breadcrumb: breadcrumb ?? null });
    return () => set({ title: "", breadcrumb: null });
  }, [title, breadcrumb, set]);

  return null;
}
