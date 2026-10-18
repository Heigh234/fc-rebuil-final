'use client';

import React from 'react';
import { ShoppingBag, Pin } from 'lucide-react';
import { MESSAGES } from '@/lib/i18n/messages';

export interface AppHeaderProps {
  onUploadClick?: () => void;
  isUploading?: boolean;
  isStickyNavEnabled?: boolean;
  onToggleStickyNav?: () => void;
}

export function AppHeader({
  onUploadClick,
  isUploading = false,
  isStickyNavEnabled = false,
  onToggleStickyNav,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 w-full bg-[#2D6A4F] text-white shadow-xs">
      <div className="max-w-[448px] mx-auto px-4 h-14 flex items-center justify-between gap-2">
        {/* Marca y Nombre */}
        <div className="flex items-center gap-2 select-none">
          <div className="w-8 h-8 rounded-lg bg-[#1B4332] flex items-center justify-center text-white">
            <ShoppingBag className="w-5 h-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-extrabold tracking-tight">Bodega FC</span>
        </div>

        {/* Acciones: Interruptor Fijar y Botón Cargar PDF */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={isStickyNavEnabled}
            aria-label={MESSAGES.STICKY_TOGGLE_ARIA_LABEL}
            onClick={onToggleStickyNav}
            className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer border select-none ${
              isStickyNavEnabled
                ? 'bg-[#D8F3E3] text-[#1C1917] border-[#D8F3E3]'
                : 'bg-[#1B4332]/70 text-white/95 border-white/25 hover:bg-[#1B4332]'
            }`}
          >
            <Pin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{MESSAGES.STICKY_TOGGLE_LABEL}</span>
            <span
              className={`w-6 h-3.5 rounded-full relative transition-colors ${
                isStickyNavEnabled ? 'bg-[#2D6A4F]' : 'bg-white/30'
              }`}
              aria-hidden="true"
            >
              <span
                className={`block w-2.5 h-2.5 rounded-full bg-white transition-transform mt-0.5 ${
                  isStickyNavEnabled ? 'translate-x-3' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            onClick={onUploadClick}
            disabled={isUploading}
            aria-label={MESSAGES.UPLOAD_PDF_BUTTON}
            className="inline-flex items-center justify-center min-h-[40px] px-3.5 py-1.5 text-sm font-semibold text-[#2D6A4F] bg-white rounded-lg shadow-xs hover:bg-[#F2EDE4] active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition cursor-pointer"
          >
            {MESSAGES.UPLOAD_PDF_BUTTON}
          </button>
        </div>
      </div>
    </header>
  );
}
