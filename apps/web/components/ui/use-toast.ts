import { useState, useCallback } from "react";

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

// Simple singleton toast state
let toastFn: ((t: Omit<Toast, "id">) => void) | null = null;

export function useToast() {
  const toast = useCallback((opts: Omit<Toast, "id">) => {
    if (toastFn) toastFn(opts);
    else console.log("[toast]", opts.description ?? opts.title);
  }, []);

  return { toast };
}
