import React, { createContext, useCallback, useContext, useState } from "react";

type Toast = {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "success" | "error" | "warning";
  durationMs?: number;
};

type ToastContextType = {
  pushToast: (t: Omit<Toast, "id">) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
};

export const ToastProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = crypto?.randomUUID?.() ?? String(Math.random());
    const toast: Toast = { id, durationMs: 3500, variant: "default", ...t };
    setToasts((prev) => [...prev, toast]);
    const ms = toast.durationMs!;
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), ms);
  }, []);

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "rounded-xl border px-4 py-3 shadow bg-white min-w-[240px]" +
              (t.variant === "success" ? " border-green-300" :
               t.variant === "error" ? " border-red-300" :
               t.variant === "warning" ? " border-yellow-300" : " border-gray-200")
            }
          >
            {t.title && <div className="font-medium">{t.title}</div>}
            {t.description && <div className="text-sm text-gray-600">{t.description}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
