'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { formatCaracasDate, formatBs } from '@/lib/domain/format';
import type { ActiveUploadSummaryDto } from '@/types/contracts';

export interface ActiveUploadBannerProps {
  activeUpload: ActiveUploadSummaryDto | null;
  onClick?: () => void;
}

export function ActiveUploadBanner({ activeUpload, onClick }: ActiveUploadBannerProps) {
  if (!activeUpload) {
    return null;
  }

  const formattedDate = formatCaracasDate(activeUpload.priceListDate);
  const formattedRate = formatBs(activeUpload.bcvRate);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-label={`Lista de precios del ${formattedDate}. Tasa BCV: ${formattedRate}. Tocar para ver historial de cargas.`}
      className="w-full bg-[#D8F3E3] border-b border-[#E7E0D5] hover:bg-[#c3ecd2] active:bg-[#b0e5c1] transition cursor-pointer select-none"
    >
      <div className="max-w-[448px] mx-auto px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-semibold text-[#1B4332]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">
            Lista del {formattedDate} · Tasa BCV: {formattedRate}
          </span>
        </div>
        <div className="flex items-center text-[#1B4332] font-bold text-base pl-2">
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
