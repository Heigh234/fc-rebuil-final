'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BottomSheet } from '@/components/shared/bottom-sheet';
import { CardSkeleton } from '@/components/shared/card-skeleton';
import { ErrorRetryState } from '@/components/shared/error-retry-state';
import { apiClient } from '@/lib/api/client';
import { formatCaracasDate, formatBs } from '@/lib/domain/format';
import { MESSAGES } from '@/lib/i18n/messages';
import type { CatalogProductDto, ProductPriceHistoryItemDto } from '@/types/contracts';

export interface PriceHistorySheetProps {
  isOpen: boolean;
  product: CatalogProductDto | null;
  onClose: () => void;
}

export function PriceHistorySheet({
  isOpen,
  product,
  onClose,
}: PriceHistorySheetProps) {
  const [history, setHistory] = useState<ProductPriceHistoryItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!product) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getProductPriceHistory(product.id);
      // Ordenar explícitamente desde la fecha más reciente a la más antigua (Sección 17: L753)
      const sorted = [...data].sort((a, b) => b.priceListDate.localeCompare(a.priceListDate));
      setHistory(sorted);
    } catch (err) {
      console.error('[Price History Error]', err);
      setError(MESSAGES.GENERIC_FETCH_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, [product?.id]);

  useEffect(() => {
    if (isOpen && product) {
      loadHistory();
    }
  }, [isOpen, product?.id, loadHistory]);

  return (
    <BottomSheet
      isOpen={isOpen}
      title={MESSAGES.PRICE_HISTORY_TITLE}
      subtitle={product?.displayName}
      onClose={onClose}
      maxHeightClass="max-h-[85vh]"
    >
      {isLoading ? (
        <CardSkeleton count={3} heightClass="h-14" />
      ) : error ? (
        <ErrorRetryState message={error} onRetry={loadHistory} isLoading={isLoading} />
      ) : history.length === 0 ? (
        <div className="py-8 text-center text-sm text-[#78716C] select-none">
          No hay precios registrados para este producto.
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#E7E0D5]">
          {history.map((item, index) => {
            const isCurrent = index === 0;
            return (
              <div
                key={`${item.uploadId}-${item.priceListDate}-${index}`}
                className="flex items-center justify-between py-3.5 first:pt-1 last:pb-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#292524] tabular-nums">
                    {formatCaracasDate(item.priceListDate)}
                  </span>
                  {isCurrent && (
                    <span className="px-2 py-0.5 text-xs font-bold text-[#2D6A4F] bg-[#D8F3E3] rounded-md">
                      {MESSAGES.PRICE_HISTORY_CURRENT_ROW}
                    </span>
                  )}
                </div>
                <span className="text-sm font-extrabold text-[#292524] tabular-nums">
                  {formatBs(item.boxPriceBs)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
