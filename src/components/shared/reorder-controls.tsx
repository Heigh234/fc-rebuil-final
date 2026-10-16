'use client';

import React from 'react';
import { ChevronUp, ChevronDown, Menu } from 'lucide-react';
import { MESSAGES } from '@/lib/i18n/messages';

export interface ReorderControlsProps {
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  dragHandleProps?: Record<string, unknown>;
  disabled?: boolean;
}

export function ReorderControls({
  index,
  total,
  onMoveUp,
  onMoveDown,
  dragHandleProps,
  disabled = false,
}: ReorderControlsProps) {
  const isFirst = index === 0;
  const isLast = index >= total - 1;

  return (
    <div className="flex items-center gap-1 select-none" onClick={(e) => e.stopPropagation()}>
      {/* Asa de arrastre (tres rayas) con zona táctil grande (Sección 17: L740) */}
      <button
        type="button"
        aria-label={MESSAGES.ORDER_MOVE}
        disabled={disabled}
        className="w-10 h-10 flex items-center justify-center text-[#78716C] hover:text-[#292524] hover:bg-[#F2EDE4] active:bg-[#E7E0D5] rounded-lg cursor-grab active:cursor-grabbing touch-none transition"
        {...dragHandleProps}
      >
        <Menu className="w-5 h-5" aria-hidden="true" />
      </button>

      {/* Flecha Subir */}
      <button
        type="button"
        aria-label={MESSAGES.ORDER_MOVE_UP}
        disabled={disabled || isFirst}
        onClick={(e) => {
          e.stopPropagation();
          if (!isFirst && !disabled) {
            onMoveUp();
          }
        }}
        className="w-8 h-8 flex items-center justify-center text-[#78716C] hover:text-[#292524] hover:bg-[#F2EDE4] active:scale-95 disabled:opacity-25 disabled:pointer-events-none rounded-lg transition cursor-pointer"
      >
        <ChevronUp className="w-4 h-4" aria-hidden="true" />
      </button>

      {/* Flecha Bajar */}
      <button
        type="button"
        aria-label={MESSAGES.ORDER_MOVE_DOWN}
        disabled={disabled || isLast}
        onClick={(e) => {
          e.stopPropagation();
          if (!isLast && !disabled) {
            onMoveDown();
          }
        }}
        className="w-8 h-8 flex items-center justify-center text-[#78716C] hover:text-[#292524] hover:bg-[#F2EDE4] active:scale-95 disabled:opacity-25 disabled:pointer-events-none rounded-lg transition cursor-pointer"
      >
        <ChevronDown className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
