'use client';

import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { MESSAGES } from '@/lib/i18n/messages';

export interface ErrorRetryStateProps {
  message?: string;
  onRetry: () => void;
  isLoading?: boolean;
}

export function ErrorRetryState({
  message = MESSAGES.GENERIC_FETCH_ERROR,
  onRetry,
  isLoading = false,
}: ErrorRetryStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 select-none">
      <div className="w-14 h-14 rounded-2xl bg-[#DC2626]/10 text-[#DC2626] flex items-center justify-center mb-4">
        <AlertCircle className="w-7 h-7" aria-hidden="true" />
      </div>

      <p className="text-sm font-semibold text-[#292524] mb-5 max-w-xs leading-relaxed">
        {message}
      </p>

      <button
        type="button"
        disabled={isLoading}
        onClick={onRetry}
        className="min-h-[44px] px-6 py-2 text-sm font-bold text-white bg-[#2D6A4F] hover:bg-[#1B4332] active:scale-95 disabled:opacity-50 rounded-xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        <span>{MESSAGES.RETRY_BUTTON}</span>
      </button>
    </div>
  );
}
