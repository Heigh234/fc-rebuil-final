'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Lock, ChevronRight, Loader2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiClientError } from '@/lib/api/client';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatBs, formatCaracasDate } from '@/lib/domain/format';
import { EmptyState } from '@/components/shared/empty-state';
import { CardSkeleton } from '@/components/shared/card-skeleton';
import { ErrorRetryState } from '@/components/shared/error-retry-state';
import type { ShoppingListSummaryDto } from '@/types/contracts';

export interface ShoppingListsTabProps {
  onSelectList: (listId: string) => void;
  onSelectFinalizedInvoice: (listId: string) => void;
  refreshTrigger?: number;
}

export function ShoppingListsTab({
  onSelectList,
  onSelectFinalizedInvoice,
  refreshTrigger,
}: ShoppingListsTabProps) {
  const [lists, setLists] = useState<ShoppingListSummaryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreatingList] = useState(false);

  const fetchLists = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.getShoppingLists();
      setLists(data);
    } catch (err) {
      console.error('[ShoppingListsTab Fetch Error]', err);
      setError(MESSAGES.GENERIC_FETCH_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists, refreshTrigger]);

  // Separar en secciones: abiertas y finalizadas con las más recientes arriba (Sección 17: L761)
  const { openLists, finalizedLists } = useMemo(() => {
    const open = lists
      .filter((l) => l.status === 'open')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const finalized = lists
      .filter((l) => l.status === 'finalized')
      .sort((a, b) => {
        const timeA = a.finalizedAt ? new Date(a.finalizedAt).getTime() : 0;
        const timeB = b.finalizedAt ? new Date(b.finalizedAt).getTime() : 0;
        return timeB - timeA;
      });

    return { openLists: open, finalizedLists: finalized };
  }, [lists]);

  // Crear una nueva lista de compras (L436, L762)
  const handleCreateList = async () => {
    setIsCreatingList(true);
    try {
      const newList = await apiClient.createShoppingList();
      toast.success(MESSAGES.LIST_CREATED);
      // Abre de inmediato el detalle de la lista nueva (L436)
      onSelectList(newList.id);
    } catch (err) {
      console.error('[Create List Error]', err);
      toast.error(
        err instanceof ApiClientError ? err.message : MESSAGES.GENERIC_ERROR
      );
    } finally {
      setIsCreatingList(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pt-2">
        <CardSkeleton count={3} heightClass="h-24" />
      </div>
    );
  }

  if (error) {
    return <ErrorRetryState message={error} onRetry={fetchLists} />;
  }

  // Estado vacío general de compras (L962-L965)
  if (lists.length === 0) {
    return (
      <EmptyState
        title={MESSAGES.EMPTY_LISTS_TITLE}
        description={MESSAGES.EMPTY_LISTS_TEXT}
        actionLabel={MESSAGES.EMPTY_LISTS_ACTION}
        onAction={handleCreateList}
        icon={<ShoppingBag className="w-8 h-8" aria-hidden="true" />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 select-text">
      {/* Botón superior Crear lista */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#78716C] uppercase tracking-wider">
          Listas de compras
        </h2>
        <button
          type="button"
          disabled={isCreating}
          onClick={handleCreateList}
          className="min-h-[44px] px-4 py-2 text-sm font-bold text-white bg-[#2D6A4F] hover:bg-[#1B4332] active:scale-95 disabled:opacity-50 rounded-xl shadow-xs flex items-center gap-1.5 transition cursor-pointer"
        >
          {isCreating ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{MESSAGES.BUTTON_CREATE_LIST}</span>
        </button>
      </div>

      {/* 1. Sección: Listas abiertas (L761) */}
      {openLists.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-bold text-[#78716C] px-1 select-none">
            Listas abiertas ({openLists.length})
          </h3>
          <div className="flex flex-col gap-2.5">
            {openLists.map((list) => (
              <div
                key={list.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectList(list.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectList(list.id);
                }}
                className="bg-white border border-[#E7E0D5] hover:border-[#2D6A4F]/40 active:scale-[0.99] rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3 transition cursor-pointer"
              >
                <div className="flex-1 min-w-0 pr-1">
                  <h4 className="font-bold text-base text-[#292524] truncate">
                    {list.name}
                  </h4>
                  <p className="text-xs text-[#78716C] mt-0.5">
                    Creada el {formatCaracasDate(list.createdAt)}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <span className="font-semibold text-[#78716C]">
                      {list.itemCount} {list.itemCount === 1 ? 'producto' : 'productos'}
                    </span>
                    {list.usdItemCount > 0 && (
                      <span className="text-[10px] font-bold text-[#4338CA] bg-[#EEF2FF] px-2 py-0.5 rounded">
                        {list.usdItemCount} USD
                      </span>
                    )}
                    {list.pricelessItemCount > 0 && (
                      <span className="text-[10px] font-bold text-[#DC2626] bg-[#FEE2E2] px-2 py-0.5 rounded">
                        {list.pricelessItemCount} sin precio
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="block text-[10px] text-[#78716C]">Total</span>
                    <span className="font-extrabold text-sm text-[#2D6A4F]">
                      {formatBs(list.totalBs)}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#78716C]" aria-hidden="true" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Sección: Listas finalizadas (L761, L765) */}
      {finalizedLists.length > 0 && (
        <div className="flex flex-col gap-2.5 mt-2">
          <h3 className="text-xs font-bold text-[#78716C] px-1 select-none flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Listas finalizadas ({finalizedLists.length})</span>
          </h3>
          <div className="flex flex-col gap-2.5">
            {finalizedLists.map((list) => (
              <div
                key={list.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectFinalizedInvoice(list.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectFinalizedInvoice(list.id);
                }}
                className="bg-white/80 border border-[#E7E0D5] hover:border-[#2D6A4F]/40 active:scale-[0.99] rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3 transition cursor-pointer"
              >
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#78716C] shrink-0" aria-hidden="true" />
                    <h4 className="font-bold text-base text-[#292524] truncate">
                      {list.name}
                    </h4>
                  </div>
                  <p className="text-xs text-[#78716C] mt-0.5">
                    Finalizada el {list.finalizedAt ? formatCaracasDate(list.finalizedAt) : '—'}
                  </p>
                  <p className="text-xs font-semibold text-[#78716C] mt-1.5">
                    {list.itemCount} {list.itemCount === 1 ? 'producto' : 'productos'}
                    {list.usdItemCount > 0 && ` (${list.usdItemCount} en USD)`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="block text-[10px] text-[#78716C]">Factura</span>
                    <span className="font-extrabold text-sm text-[#2D6A4F]">
                      {formatBs(list.totalBs)}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#78716C]" aria-hidden="true" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
