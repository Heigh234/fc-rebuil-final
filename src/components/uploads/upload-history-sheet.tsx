'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Download, FileText } from 'lucide-react';
import { BottomSheet } from '@/components/shared/bottom-sheet';
import { CardSkeleton } from '@/components/shared/card-skeleton';
import { ErrorRetryState } from '@/components/shared/error-retry-state';
import { EmptyState } from '@/components/shared/empty-state';
import { apiClient } from '@/lib/api/client';
import { formatCaracasDate, formatBs } from '@/lib/domain/format';
import { MESSAGES } from '@/lib/i18n/messages';
import type { UploadHistoryItemDto, UploadStatus } from '@/types/contracts';

export interface UploadHistorySheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StatusBadgeConfig {
  label: string;
  bgClass: string;
  textClass: string;
}

const STATUS_CONFIGS: Record<UploadStatus, StatusBadgeConfig> = {
  applied: {
    label: MESSAGES.STATUS_CURRENT,
    bgClass: 'bg-[#D8F3E3]',
    textClass: 'text-[#1B4332]',
  },
  not_applied: {
    label: MESSAGES.STATUS_PREVIOUS,
    bgClass: 'bg-[#F2EDE4]',
    textClass: 'text-[#78716C]',
  },
  pending: {
    label: MESSAGES.STATUS_PROCESSING,
    bgClass: 'bg-[#F2EDE4]',
    textClass: 'text-[#78716C]',
  },
  failed: {
    label: MESSAGES.STATUS_FAILED,
    bgClass: 'bg-[#DC2626]/10',
    textClass: 'text-[#DC2626]',
  },
};

export function UploadHistorySheet({ isOpen, onClose }: UploadHistorySheetProps) {
  const [history, setHistory] = useState<UploadHistoryItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getUploadHistory();
      setHistory(data);
    } catch (err) {
      console.error('[Upload History Error]', err);
      setError(MESSAGES.GENERIC_FETCH_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, loadHistory]);

  return (
    <BottomSheet
      isOpen={isOpen}
      title={MESSAGES.UPLOAD_HISTORY_TITLE}
      onClose={onClose}
      maxHeightClass="max-h-[92vh]"
    >
      {isLoading ? (
        <CardSkeleton count={4} heightClass="h-28" />
      ) : error ? (
        <ErrorRetryState message={error} onRetry={loadHistory} />
      ) : history.length === 0 ? (
        <EmptyState
          title={MESSAGES.EMPTY_UPLOAD_HISTORY}
          icon={<FileText className="w-8 h-8" aria-hidden="true" />}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {history.map((item) => {
            const statusConfig = STATUS_CONFIGS[item.status] || STATUS_CONFIGS.pending;
            const dateStr = item.priceListDate ? formatCaracasDate(item.priceListDate) : '-';
            const rateStr = item.bcvRate != null ? formatBs(item.bcvRate) : '-';
            const downloadUrl = apiClient.getDownloadUrl(item.id);

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-4 border border-[#E7E0D5] shadow-xs flex flex-col gap-2.5"
              >
                {/* Cabecera de la tarjeta: Nombre de archivo y Badge de estado */}
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate flex-1">
                    <h3 className="text-sm font-bold text-[#292524] truncate" title={item.originalFilename}>
                      {item.originalFilename}
                    </h3>
                    <p className="text-xs text-[#78716C] mt-0.5">
                      Subido: {formatCaracasDate(item.createdAt)}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${statusConfig.bgClass} ${statusConfig.textClass}`}
                  >
                    {statusConfig.label}
                  </span>
                </div>

                {/* Datos de la carga */}
                <div className="grid grid-cols-3 gap-2 bg-[#FFFBF5] rounded-xl p-2.5 text-xs border border-[#E7E0D5]/60">
                  <div>
                    <span className="text-[#78716C] block">Fecha lista</span>
                    <span className="font-semibold text-[#292524] tabular-nums">{dateStr}</span>
                  </div>
                  <div>
                    <span className="text-[#78716C] block">Tasa BCV</span>
                    <span className="font-semibold text-[#292524] tabular-nums">{rateStr}</span>
                  </div>
                  <div>
                    <span className="text-[#78716C] block">Productos</span>
                    <span className="font-semibold text-[#292524] tabular-nums">{item.productCount}</span>
                  </div>
                </div>

                {/* Acción Descargar PDF (Sección 17: L710) */}
                <div className="flex items-center justify-end pt-1">
                  <a
                    href={downloadUrl}
                    download={item.originalFilename}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-bold text-[#2D6A4F] bg-[#D8F3E3]/60 hover:bg-[#D8F3E3] active:scale-95 rounded-lg transition"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{MESSAGES.ACTION_DOWNLOAD_PDF}</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
