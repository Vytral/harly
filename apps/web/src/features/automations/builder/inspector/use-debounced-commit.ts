"use client";

import { useEffect, useRef, useState } from "react";

export function useDebouncedCommit(
  value: string,
  onCommit: (value: string) => void,
  delay = 750,
) {
  const [local, setLocal] = useState(value);
  const committed = useRef(value);

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setLocal(value);
    }
  }, [value]);

  useEffect(() => {
    if (local === committed.current) return;
    const timer = window.setTimeout(() => {
      committed.current = local;
      onCommit(local);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [local, delay, onCommit]);

  return {
    value: local,
    setValue: setLocal,
    flush: () => {
      if (local === committed.current) return;
      committed.current = local;
      onCommit(local);
    },
  };
}
