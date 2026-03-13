import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = crypto.randomUUID();
    const toast: ToastItem = { id, message, tone };

    setToasts((prev) => [...prev, toast]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: "grid",
          gap: 8,
          zIndex: 9999,
          width: 320,
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="ms-toast"
            style={{ background: backgroundForTone(toast.tone) }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}

function backgroundForTone(tone: ToastTone) {
  switch (tone) {
    case "success": return "#107c10";
    case "error":   return "#d13438";
    case "info":
    default:        return "#0078d4";
  }
}