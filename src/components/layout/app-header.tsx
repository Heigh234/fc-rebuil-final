'use client';

import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { MESSAGES } from '@/lib/i18n/messages';

export interface AppHeaderProps {
  onUploadClick?: () => void;
  isUploading?: boolean;
}

export function AppHeader({ onUploadClick, isUploading = false }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 w-full bg-[#2D6A4F] text-white shadow-xs">
      <div className="max-w-[448px] mx-auto px-4 h-14 flex items-center justify-between">
        {/* Marca y Nombre */}
        <div className="flex items-center gap-2 select-none">
          <div className="w-8 h-8 rounded-lg bg-[#1B4332] flex items-center justify-center text-white">
            <ShoppingBag className="w-5 h-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-extrabold tracking-tight">Bodega FC</span>
        </div>

        {/* Único botón de acción: Cargar PDF */}
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
    </header>
  );
}
