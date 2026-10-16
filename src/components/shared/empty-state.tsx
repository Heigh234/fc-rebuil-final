'use client';

import React from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 select-none">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-[#D8F3E3] text-[#2D6A4F] flex items-center justify-center mb-4 shadow-xs">
          {icon}
        </div>
      )}

      <h3 className="text-base font-bold text-[#292524] mb-1.5 leading-snug">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-[#78716C] max-w-xs mb-6 leading-relaxed">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-[44px] px-6 py-2.5 text-sm font-bold text-white bg-[#2D6A4F] hover:bg-[#1B4332] active:scale-95 rounded-xl shadow-xs transition cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
