'use client';

import React, { useMemo } from 'react';
import { Lock, ArrowLeft, AlertCircle } from 'lucide-react';
import { formatBs, formatCaracasDate, formatLineAmount } from '@/lib/domain/format';
import { MESSAGES } from '@/lib/i18n/messages';
import type { InvoiceDto } from '@/types/contracts';

export interface InvoiceViewProps {
  invoice: InvoiceDto;
  onBack: () => void;
}

export function InvoiceView({ invoice, onBack }: InvoiceViewProps) {
  // Las líneas deben mostrarse en orden alfabético por productName (Sección 12: L523, Sección 17: L793)
  const sortedLines = useMemo(() => {
    return [...invoice.lines].sort((a, b) =>
      a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' })
    );
  }, [invoice.lines]);

  return (
    <div className="flex flex-col gap-4 select-text">
      {/* Botón de regreso */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a listas de compras"
          className="min-h-[44px] inline-flex items-center gap-2 text-sm font-bold text-[#2D6A4F] hover:text-[#1B4332] active:scale-95 transition cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          <span>Volver a Compras</span>
        </button>
      </div>

      {/* Encabezado de Factura Bloqueada */}
      <div className="bg-white border border-[#E7E0D5] rounded-2xl p-5 shadow-xs">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-[#2D6A4F] bg-[#D8F3E3] rounded-full select-none">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Factura finalizada</span>
              </span>
            </div>
            <h1 className="text-lg font-extrabold text-[#292524] break-words">
              {invoice.listName}
            </h1>
          </div>
        </div>

        {/* Metadatos capturados de la finalización */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#E7E0D5] text-xs text-[#78716C]">
          <div>
            <span className="block font-medium">Fecha de factura:</span>
            <span className="font-bold text-[#292524]">
              {formatCaracasDate(invoice.finalizedAt)}
            </span>
          </div>
          <div>
            <span className="block font-medium">Fecha de lista de precios:</span>
            <span className="font-bold text-[#292524]">
              {formatCaracasDate(invoice.priceListDate)}
            </span>
          </div>
          <div className="col-span-2 pt-1">
            <span className="inline-block font-medium mr-1.5">Tasa BCV capturada:</span>
            <span className="font-bold text-[#292524]">
              {formatBs(invoice.bcvRate)}
            </span>
          </div>
        </div>
      </div>

      {/* Aclaración de líneas USD si existen (L525, L917) */}
      {invoice.hasUsdLines && (
        <div className="flex items-start gap-3 p-4 bg-[#FFF9E6] border border-[#FDE68A] rounded-2xl text-xs text-[#92400E]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed font-semibold">
            {MESSAGES.INVOICE_USD_DISCLAIMER}
          </p>
        </div>
      )}

      {/* Lista de productos en orden alfabético */}
      <div className="flex flex-col gap-2.5">
        <h2 className="text-sm font-bold text-[#78716C] px-1 select-none">
          Productos ({sortedLines.length})
        </h2>

        {sortedLines.map((line) => (
          <div
            key={line.id}
            className="bg-white border border-[#E7E0D5] rounded-2xl p-4 shadow-xs flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-bold text-sm text-[#292524] break-words flex-1">
                {line.productName}
              </span>
              <span className="font-extrabold text-sm text-[#292524] shrink-0">
                {formatLineAmount(line.lineTotalBs, line.currencyTag)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-[#78716C] pt-1 border-t border-[#E7E0D5]/60">
              <span>
                {line.quantity} {line.quantity === 1 ? 'caja' : 'cajas'} × {formatBs(line.boxPriceBs)}
              </span>
              <span
                className={`font-bold px-2 py-0.5 rounded-md ${
                  line.currencyTag === 'USD'
                    ? 'bg-[#E0E7FF] text-[#3730A3]'
                    : 'bg-[#F2EDE4] text-[#292524]'
                }`}
              >
                {line.currencyTag}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Total de la Factura en Bolívares */}
      <div className="bg-white border border-[#E7E0D5] rounded-2xl p-5 shadow-sm mt-2 flex items-center justify-between">
        <div>
          <span className="block text-xs font-semibold text-[#78716C]">
            Total en bolívares
          </span>
          <span className="text-xl font-extrabold text-[#2D6A4F]">
            {formatBs(invoice.totalBs)}
          </span>
        </div>
        <div className="text-right text-xs text-[#78716C]">
          <span>{sortedLines.length} {sortedLines.length === 1 ? 'producto' : 'productos'}</span>
        </div>
      </div>
    </div>
  );
}
