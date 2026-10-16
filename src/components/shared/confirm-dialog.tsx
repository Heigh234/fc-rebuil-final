'use client';

import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { MESSAGES } from '@/lib/i18n/messages';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText,
  cancelText = MESSAGES.CANCEL_BUTTON,
  variant = 'default',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Foco inicial automático en "Cancelar" (Sección 17: L803)
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Tecla Escape cancela (mientras no esté en ejecución)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  const isDestructive = variant === 'destructive';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs select-none"
      onClick={(e) => {
        // Tocar fuera de la ventana equivale a cancelar (L803)
        if (e.target === e.currentTarget && !isLoading) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-[400px] bg-white rounded-2xl p-6 shadow-2xl border border-[#E7E0D5] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-bold text-[#292524] mb-2 leading-snug"
        >
          {title}
        </h2>

        <p
          id="confirm-dialog-description"
          className="text-sm text-[#78716C] mb-6 leading-relaxed"
        >
          {description}
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold text-[#292524] bg-[#F2EDE4] hover:bg-[#E7E0D5] active:scale-95 rounded-xl disabled:opacity-50 transition cursor-pointer"
          >
            {cancelText}
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`min-h-[44px] px-5 py-2 text-sm font-bold text-white rounded-xl shadow-xs active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 transition cursor-pointer ${
              isDestructive
                ? 'bg-[#DC2626] hover:bg-[#b91c1c]'
                : 'bg-[#2D6A4F] hover:bg-[#1B4332]'
            }`}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
