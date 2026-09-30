"use client";

import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

export function Toaster() {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="toast-viewport">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-lg border p-4 pr-8 shadow-lg transition-all animate-slide-up",
            toast.variant === "destructive"
              ? "border-destructive bg-destructive text-destructive-foreground"
              : toast.variant === "success"
              ? "border-success/20 bg-success/10 text-foreground"
              : "border-border bg-background text-foreground"
          )}
        >
          <div className="flex items-start gap-3">
            {toast.variant === "destructive" ? (
              <AlertCircle className="h-5 w-5 shrink-0" />
            ) : toast.variant === "success" ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-success" />
            ) : (
              <Info className="h-5 w-5 shrink-0" />
            )}
            <div className="grid gap-1">
              <div className="text-sm font-semibold">{toast.title}</div>
              {toast.description && (
                <div className="text-sm opacity-90">{toast.description}</div>
              )}
            </div>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// Hook to use toast
export function useToast() {
  const addToast = useUIStore((state) => state.addToast);

  return {
    toast: (props: { title: string; description?: string; variant?: "default" | "success" | "destructive" }) => {
      addToast(props);
    },
  };
}

