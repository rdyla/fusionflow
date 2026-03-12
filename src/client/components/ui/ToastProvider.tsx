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
          top: 20,
          right: 20,
          display: "grid",
          gap: 10,
          zIndex: 9999,
          width: 320,
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              borderRadius: 12,
              padding: "12px 14px",
              color: "#fff",
              fontWeight: 600,
              boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
              border: "1px solid rgba(255,255,255,0.1)",
              background: backgroundForTone(toast.tone),
            }}
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
    case "success":
      return "#15803d";
    case "error":
      return "#b91c1c";
    case "info":
    default:
      return "#1d4ed8";
  }
}