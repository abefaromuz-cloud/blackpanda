import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

// Глобальные всплывающие уведомления (например «✅ Продажа оформлена»).
// Не путать с обычными inline-ошибками формы (текст под шапкой страницы) — тост
// используется именно для явного подтверждения результата действия, которое
// пользователь мог не заметить (например, пока ждал ответ сервера).
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const showToast = useCallback((message, type = 'success', duration = 3500) => {
    const id = ++idRef.current;
    setToasts(list => [...list, { id, message, type }]);
    setTimeout(() => {
      setToasts(list => list.filter(t => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-xs sm:max-w-sm px-4 py-3 rounded-xl2 shadow-lg border text-sm font-medium animate-toast-in
              ${t.type === 'success' ? 'bg-green/15 border-green text-green' : ''}
              ${t.type === 'error' ? 'bg-red/15 border-red text-red' : ''}
              ${t.type === 'info' ? 'bg-bg3 border-border text-text' : ''}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast должен вызываться внутри <ToastProvider>');
  return ctx;
}
