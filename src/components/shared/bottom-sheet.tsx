'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface BottomSheetProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  preventOutsideClose?: boolean;
  children: React.ReactNode;
  maxHeightClass?: string;
}

export function BottomSheet({
  isOpen,
  title,
  subtitle,
  onClose,
  preventOutsideClose = false,
  children,
  maxHeightClass = 'max-h-[90vh]',
}: BottomSheetProps) {
  // Manejo de tecla Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventOutsideClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, preventOutsideClose, onClose]);

  // Bloqueo de scroll en body mientras está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50 backdrop-blur-xs select-none"
      onClick={() => {
        if (!preventOutsideClose) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full max-w-[448px] mx-auto bg-white rounded-t-3xl shadow-2xl border-t border-x border-[#E7E0D5] flex flex-col ${maxHeightClass} animate-in slide-in-from-bottom duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra superior con asa táctil */}
        <div className="pt-3 pb-1 flex flex-col items-center">
          <div className="w-10 h-1.5 bg-[#E7E0D5] rounded-full mb-2" aria-hidden="true" />
        </div>

        {/* Encabezado de la hoja */}
        <div className="px-5 pb-3 flex items-center justify-between border-b border-[#E7E0D5]">
          <div className="truncate pr-2">
            <h2 className="text-base font-extrabold text-[#292524] truncate">{title}</h2>
            {subtitle && (
              <p className="text-xs text-[#78716C] truncate mt-0.5">{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-[#78716C] hover:text-[#292524] hover:bg-[#F2EDE4] active:scale-95 transition cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Contenido desplazable */}
        <div className="flex-1 overflow-y-auto p-5 select-text">
          {children}
        </div>
      </div>
    </div>
  );
}
