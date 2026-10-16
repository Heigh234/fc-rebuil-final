'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { MESSAGES } from '@/lib/i18n/messages';

export type UploadProgressStep = 'uploading' | 'reading' | 'updating';

export interface UploadProgressModalProps {
  isOpen: boolean;
  step: UploadProgressStep;
}

const STEP_MESSAGES: Record<UploadProgressStep, string> = {
  uploading: MESSAGES.PROGRESS_UPLOADING,
  reading: MESSAGES.PROGRESS_READING,
  updating: MESSAGES.PROGRESS_UPDATING_CATALOG,
};

export function UploadProgressModal({ isOpen, step }: UploadProgressModalProps) {
  if (!isOpen) return null;

  const currentMessage = STEP_MESSAGES[step] || MESSAGES.PROGRESS_UPLOADING;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Progreso de carga del PDF"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
      onClick={(e) => {
        // La ventana de progreso no se puede cerrar ni tocar fuera de ella (Sección 8: L299, Sección 17: L704)
        e.stopPropagation();
      }}
    >
      <div
        className="w-full max-w-[340px] bg-white rounded-2xl p-6 shadow-2xl border border-[#E7E0D5] flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-14 h-14 rounded-full bg-[#D8F3E3] text-[#2D6A4F] flex items-center justify-center mb-4">
          <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
        </div>

        <p className="text-base font-bold text-[#292524] mb-2 leading-snug">
          {currentMessage}
        </p>

        <p className="text-xs text-[#78716C] leading-relaxed">
          Por favor, no cierres la aplicación mientras se procesa la lista.
        </p>

        {/* Indicador de pasos visuales */}
        <div className="flex items-center gap-1.5 mt-5">
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              step === 'uploading' || step === 'reading' || step === 'updating'
                ? 'bg-[#2D6A4F]'
                : 'bg-[#E7E0D5]'
            }`}
          />
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              step === 'reading' || step === 'updating'
                ? 'bg-[#2D6A4F]'
                : 'bg-[#E7E0D5]'
            }`}
          />
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              step === 'updating' ? 'bg-[#2D6A4F]' : 'bg-[#E7E0D5]'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
