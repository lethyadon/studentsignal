import { useEffect, useState } from 'react';
import { CheckCircle, X, AlertTriangle, RotateCcw } from 'lucide-react';

export interface ToastMessage {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  undoFn?: () => void;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function Toast({ toasts, onDismiss }: ToastProps) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium pointer-events-auto animate-in slide-in-from-right-4 duration-200 ${
            toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : toast.type === 'info'
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          )}
          <span>{toast.message}</span>
          {toast.undoFn && (
            <button
              onClick={() => { toast.undoFn!(); onDismiss(toast.id); }}
              className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-semibold transition-colors border border-emerald-200"
            >
              <RotateCcw className="w-3 h-3" />
              Undo
            </button>
          )}
          <button
            onClick={() => onDismiss(toast.id)}
            className="ml-1 p-0.5 rounded hover:bg-black/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function addToast(message: string, type: ToastMessage['type'] = 'success', undoFn?: () => void) {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type, undoFn }]);
    const delay = undoFn ? 5000 : 3500;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), delay);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return { toasts, addToast, dismissToast };
}

