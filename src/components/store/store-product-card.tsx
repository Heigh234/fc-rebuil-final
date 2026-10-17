'use client';

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { StoreProductDto } from '@/types/contracts';
import { ReorderControls } from '@/components/shared/reorder-controls';
import { formatBs, formatMarginPercent } from '@/lib/domain/format';
import { MESSAGES } from '@/lib/i18n/messages';

export interface StoreProductCardProps {
  product: StoreProductDto;
  index: number;
  total: number;
  showReorderControls: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  dragHandleProps?: Record<string, unknown>;
  onEdit: () => void;
  onAddToList: () => void;
}

export function StoreProductCard({
  product,
  index,
  total,
  showReorderControls,
  onMoveUp,
  onMoveDown,
  dragHandleProps,
  onEdit,
  onAddToList,
}: StoreProductCardProps) {
  const hasPreviousPrice =
    product.previousPriceBs !== null && product.baseBoxPriceBs !== null;
  const isPriceUp =
    hasPreviousPrice && product.baseBoxPriceBs! > product.previousPriceBs!;
  const isPriceDown =
    hasPreviousPrice && product.baseBoxPriceBs! < product.previousPriceBs!;
  const showPriceIndicator = isPriceUp || isPriceDown;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            onEdit();
          }
        }
      }}
      className="bg-white border border-[#E7E0D5] rounded-2xl p-4 shadow-xs hover:border-[#2D6A4F] active:border-[#2D6A4F] transition cursor-pointer flex flex-col gap-3 select-none"
    >
      {/* Encabezado: Asa/Flechas de reordenamiento (si aplica) y Nombre del producto */}
      <div className="flex items-start justify-between gap-2">
        {showReorderControls && (
          <div className="shrink-0 -ml-1 -mt-1" onClick={(e) => e.stopPropagation()}>
            <ReorderControls
              index={index}
              total={total}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              dragHandleProps={dragHandleProps}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[#292524] text-base leading-snug break-words">
            {product.customName}
          </h3>
        </div>
      </div>

      {/* Precios: Base por caja, Por unidad y Precios de venta */}
      <div className="flex flex-col gap-1.5 text-base">
        {/* Precio por caja + Indicador de variación */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-baseline gap-1.5 text-[#78716C]">
            <span>Por caja:</span>
            {product.baseBoxPriceBs !== null ? (
              <span className="font-bold text-[#292524] tabular-nums">
                {formatBs(product.baseBoxPriceBs)}
              </span>
            ) : (
              <span className="text-[#78716C] font-semibold text-xs px-2 py-0.5 bg-[#F2EDE4] rounded-md">
                {MESSAGES.PRICELESS}
              </span>
            )}
          </div>

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

        {/* Precio por unidad */}
        {product.unitPriceBs !== null && (
          <div className="flex items-baseline gap-1.5 text-[#78716C] flex-wrap">
            <span>Por unidad:</span>
            <span className="font-bold text-[#292524] tabular-nums">
              {formatBs(product.unitPriceBs)}
            </span>
          </div>
        )}

        {/* Precios de venta según márgenes */}
        {product.salePrices && product.salePrices.length > 0 && (
          <div className="flex flex-col gap-1 pt-1.5 border-t border-[#F2EDE4]">
            {product.salePrices.map((sp, idx) => (
              <div
                key={idx}
                className="flex items-baseline gap-1.5 text-base text-[#78716C] flex-wrap"
              >
                <span>
                  {MESSAGES.previewSalePriceWithMargin(
                    formatMarginPercent(sp.marginPercent).replace('%', '')
                  )}:
                </span>
                <span className="font-extrabold text-[#2D6A4F] tabular-nums">
                  {formatBs(sp.salePriceBs)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botones de acción inferiores */}
      <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddToList();
          }}
          className="flex-1 min-h-[44px] px-4 py-2 text-sm font-bold text-[#292524] bg-[#F2EDE4] hover:bg-[#E7E0D5] active:scale-95 rounded-xl transition cursor-pointer flex items-center justify-center text-center"
        >
          {MESSAGES.ACTION_ADD_TO_LIST}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="flex-1 min-h-[44px] px-4 py-2 text-sm font-bold text-[#2D6A4F] bg-[#D8F3E3] hover:bg-[#c2ebd1] active:scale-95 rounded-xl transition cursor-pointer flex items-center justify-center text-center"
        >
          {MESSAGES.BUTTON_EDIT}
        </button>
      </div>
    </div>
  );
}
