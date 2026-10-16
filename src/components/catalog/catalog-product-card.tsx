'use client';

import React from 'react';
import { ChevronRight, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { formatBs } from '@/lib/domain/format';
import { MESSAGES } from '@/lib/i18n/messages';
import type { CatalogProductDto } from '@/types/contracts';

export interface CatalogProductCardProps {
  product: CatalogProductDto;
  onPriceClick: () => void;
  onAddToStore: () => void;
  onAddToList: () => void;
  isAddingToStore?: boolean;
}

export function CatalogProductCard({
  product,
  onPriceClick,
  onAddToStore,
  onAddToList,
  isAddingToStore = false,
}: CatalogProductCardProps) {
  const hasPreviousPrice = product.previousPriceBs !== null;
  const isPriceUp = hasPreviousPrice && product.currentPriceBs > product.previousPriceBs!;
  const isPriceDown = hasPreviousPrice && product.currentPriceBs < product.previousPriceBs!;
  const showPriceIndicator = isPriceUp || isPriceDown;

  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E7E0D5] shadow-xs flex flex-col justify-between gap-3">
      {/* 1. Nombre del producto */}
      <h3
        className="font-bold text-[#292524] text-sm leading-snug break-words"
        title={product.displayName}
      >
        {product.displayName}
      </h3>

      {/* 2. Sección de precio: Actual con flecha a historial y variación respecto al anterior */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={onPriceClick}
          className="inline-flex items-center gap-1 group py-1 -my-1 rounded-lg text-left cursor-pointer hover:opacity-80 transition"
          aria-label={`Ver historial de precios de ${product.displayName}`}
        >
          <span className="text-base font-extrabold text-[#292524] tabular-nums">
            {formatBs(product.currentPriceBs)}
          </span>
          <ChevronRight
            className="w-4 h-4 text-[#78716C] group-hover:text-[#292524] group-hover:translate-x-0.5 transition"
            aria-hidden="true"
          />
        </button>

        {showPriceIndicator && (
          <div
            className={`inline-flex items-center gap-1 text-xs font-bold tabular-nums ${
              isPriceUp ? 'text-[#DC2626]' : 'text-[#16A34A]'
            }`}
            title={
              isPriceUp
                ? `Precio anterior: ${formatBs(product.previousPriceBs!)} (subió)`
                : `Precio anterior: ${formatBs(product.previousPriceBs!)} (bajó)`
            }
          >
            {isPriceUp ? (
              <>
                <TrendingUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{formatBs(product.previousPriceBs!)}</span>
              </>
            ) : (
              <>
                <TrendingDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{formatBs(product.previousPriceBs!)}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* 3. Acciones de tienda y lista de compras */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#E7E0D5]/60 mt-0.5">
        {product.inStore ? (
          <span className="px-2.5 py-1 text-xs font-semibold text-[#2D6A4F] bg-[#D8F3E3] rounded-full inline-flex items-center">
            En tu tienda
          </span>
        ) : (
          <button
            type="button"
            onClick={onAddToStore}
            disabled={isAddingToStore}
            className="min-h-[44px] flex-1 px-3 py-2 text-xs font-bold text-[#2D6A4F] bg-[#D8F3E3] hover:bg-[#c2ebd1] active:scale-95 disabled:opacity-50 rounded-xl transition cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            {isAddingToStore && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            )}
            <span>{MESSAGES.ACTION_ADD_TO_STORE}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onAddToList}
          className={`min-h-[44px] px-3 py-2 text-xs font-bold text-[#292524] bg-[#F2EDE4] hover:bg-[#E7E0D5] active:scale-95 rounded-xl transition cursor-pointer inline-flex items-center justify-center ${
            product.inStore ? '' : 'flex-1'
          }`}
        >
          {MESSAGES.ACTION_ADD_TO_LIST}
        </button>
      </div>
    </div>
  );
}
