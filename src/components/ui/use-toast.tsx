import React, { useState, useCallback } from 'react';

interface ToastProps {
  id?: number;
  title: string;
  description: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const toast = useCallback(({ title, description, variant = 'default' }: Omit<ToastProps, 'id'>) => {
    const id = Date.now();
    const newToast = { id, title, description, variant };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  return { toast, toasts };
}

export function Toast({ title, description, variant = 'default' }: ToastProps) {
  return (
    <div
      className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg ${
        variant === 'destructive' ? 'bg-red-500' : 'bg-green-500'
      } text-white`}
    >
      <h3 className="font-semibold">{title}</h3>
      <p>{description}</p>
    </div>
  );
} 