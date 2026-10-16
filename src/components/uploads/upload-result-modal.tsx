'use client';

import React, { useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { MESSAGES } from '@/lib/i18n/messages';

export interface UploadResultModalProps {
  isOpen: boolean;
  readCount: number;
  newCount: number;
  pricelessStoreCount: number;
  onClose: () => void;
}

export function UploadResultModal({
  isOpen,
  readCount,
  newCount,
  pricelessStoreCount,
  onClose,
}: UploadResultModalProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        buttonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasPricelessItems = pricelessStoreCount > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-result-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[380px] bg-white rounded-2xl p-6 shadow-2xl border border-[#E7E0D5] flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#D8F3E3] text-[#2D6A4F] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 id="upload-result-title" className="text-lg font-extrabold text-[#292524]">
            {MESSAGES.RESULT_PDF_LOADED}
          </h2>
        </div>

        {/* Resumen de cantidades */}
        <div className="bg-[#FFFBF5] rounded-xl p-4 border border-[#E7E0D5] flex flex-col gap-2.5 mb-4 text-sm font-semibold text-[#292524]">
          <div className="flex items-center justify-between">
            <span className="text-[#78716C]">Productos leídos</span>
            <span className="tabular-nums font-bold text-[#292524]">{readCount}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#78716C]">Productos nuevos</span>
            <span className="tabular-nums font-bold text-[#2D6A4F]">{newCount}</span>
          </div>

          {hasPricelessItems && (
            <div className="flex items-center justify-between pt-1 border-t border-[#E7E0D5]">
              <span className="text-[#DC2626]">Productos de tu tienda sin precio</span>
              <span className="tabular-nums font-bold text-[#DC2626]">{pricelessStoreCount}</span>
            </div>
          )}
        </div>

        {/* Aviso bajo el resultado solo si hay productos sin precio (Sección 18: L843-844) */}
        {hasPricelessItems && (
          <div className="flex items-start gap-2.5 bg-[#FFF5F5] border border-[#DC2626]/20 rounded-xl p-3 mb-5 text-xs text-[#DC2626] leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{MESSAGES.RESULT_PRICELESS_WARNING}</span>
          </div>
        )}

        <button
          ref={buttonRef}
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] py-2.5 px-4 text-sm font-bold text-white bg-[#2D6A4F] hover:bg-[#1B4332] active:scale-95 rounded-xl shadow-xs transition cursor-pointer"
        >
          {MESSAGES.RESULT_UNDERSTOOD_BUTTON}
        </button>
      </div>
    </div>
  );
}
