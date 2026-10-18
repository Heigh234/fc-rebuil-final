'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { CardSkeleton } from '@/components/shared/card-skeleton';
import { ErrorRetryState } from '@/components/shared/error-retry-state';
import { CatalogProductCard } from './catalog-product-card';
import { PriceHistorySheet } from './price-history-sheet';
import { apiClient, ApiClientError } from '@/lib/api/client';
import { matchesMultiWordQuery } from '@/lib/domain/search';
import { MESSAGES } from '@/lib/i18n/messages';
import type { CatalogProductDto } from '@/types/contracts';

export interface CatalogTabProps {
  hasActiveUpload: boolean;
  onUploadClick: () => void;
  onOpenAddToList: (product: CatalogProductDto) => void;
  onStoreChanged?: () => void;
  onSheetOpenChange?: (isOpen: boolean) => void;
  isStickySearch?: boolean;
}

export function CatalogTab({
  hasActiveUpload,
  onUploadClick,
  onOpenAddToList,
  onStoreChanged,
  onSheetOpenChange,
  isStickySearch = false,
}: CatalogTabProps) {
  const [catalog, setCatalog] = useState<CatalogProductDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del historial de precios (hoja inferior)
  const [selectedProductForHistory, setSelectedProductForHistory] =
    useState<CatalogProductDto | null>(null);
  const [isHistorySheetOpen, setIsHistorySheetOpen] = useState(false);

  // Identificadores de productos agregándose a la tienda en curso
  const [addingProductIds, setAddingProductIds] = useState<Set<string>>(new Set());

  // Carga de productos del catálogo activo
  const loadCatalog = useCallback(async () => {
    if (!hasActiveUpload) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getCatalog();
      setCatalog(data);
    } catch (err) {
      console.error('[Catalog Fetch Error]', err);
      setError(MESSAGES.GENERIC_FETCH_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, [hasActiveUpload]);

  useEffect(() => {
    if (hasActiveUpload) {
      loadCatalog();
    }
  }, [hasActiveUpload, loadCatalog]);

  // Manejo de apertura/cierre de la hoja de historial de precios
  const handlePriceClick = (product: CatalogProductDto) => {
    setSelectedProductForHistory(product);
    setIsHistorySheetOpen(true);
    onSheetOpenChange?.(true);
  };

  const handleCloseHistorySheet = () => {
    setIsHistorySheetOpen(false);
    onSheetOpenChange?.(false);
  };

  // Asegurar notificación de cierre si el componente se desmonta con la hoja abierta
  useEffect(() => {
    return () => {
      if (isHistorySheetOpen) {
        onSheetOpenChange?.(false);
      }
    };
  }, [isHistorySheetOpen, onSheetOpenChange]);

  // Agregar producto a Mi tienda con actualización optimista y manejo de errores
  const handleAddToStore = async (product: CatalogProductDto) => {
    if (product.inStore || addingProductIds.has(product.id)) return;

    setAddingProductIds((prev) => new Set(prev).add(product.id));

    // Actualización optimista: marcar inStore inmediatamente
    setCatalog((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, inStore: true } : p))
    );

    try {
      await apiClient.createStoreProduct({ productId: product.id });
      toast.success(MESSAGES.PRODUCT_ADDED_TO_STORE);
      onStoreChanged?.();
    } catch (err: unknown) {
      console.error('[Add to Store Error]', err);

      const isConflict =
        (err instanceof ApiClientError && (err.status === 409 || err.code === 'CONFLICT')) ||
        (typeof err === 'object' &&
          err !== null &&
          'status' in err &&
          (err as { status: unknown }).status === 409) ||
        (err instanceof Error && err.message.includes(MESSAGES.PRODUCT_ALREADY_IN_STORE));

      if (isConflict) {
        toast.info(MESSAGES.PRODUCT_ALREADY_IN_STORE);
        // Se mantiene inStore = true porque en efecto ya existía en la tienda
      } else {
        // Revertir cambio optimista en caso de error inesperado
        setCatalog((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, inStore: false } : p))
        );
        const errorMsg = err instanceof Error ? err.message : MESSAGES.GENERIC_ERROR;
        toast.error(errorMsg);
      }
    } finally {
      setAddingProductIds((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }
  };

  // Filtrado multi-palabra insensible a tildes y mayúsculas (MOD-01, Sección 17: L757)
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return catalog;
    return catalog.filter((product) =>
      matchesMultiWordQuery(searchQuery, [product.displayName, product.sourceName])
    );
  }, [catalog, searchQuery]);

  // Si no hay lista cargada activa, mostrar estado vacío correspondiente (Sección 18: L954-L957)
  if (!hasActiveUpload) {
    return (
      <EmptyState
        title={MESSAGES.EMPTY_CATALOG_TITLE}
        description={MESSAGES.EMPTY_CATALOG_TEXT}
        actionLabel={MESSAGES.EMPTY_CATALOG_ACTION}
        onAction={onUploadClick}
        icon={<FileText className="w-8 h-8" aria-hidden="true" />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de búsqueda local */}
      <div
        className={
          isStickySearch
            ? 'sticky top-28 z-20 bg-[#FFFBF5] py-2 -mx-4 px-4 border-b border-[#E7E0D5] shadow-xs'
            : ''
        }
      >
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#78716C]">
            <Search className="w-4 h-4" aria-hidden="true" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full min-h-[44px] pl-10 pr-10 py-2.5 bg-white border border-[#E7E0D5] rounded-xl text-sm text-[#292524] placeholder-[#78716C] focus:outline-none focus:ring-2 focus:ring-[#2D6A4F] focus:border-transparent transition"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#78716C] hover:text-[#292524] cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Estados de carga, error y lista de resultados */}
      {isLoading && catalog.length === 0 ? (
        <CardSkeleton count={4} heightClass="h-28" />
      ) : error && catalog.length === 0 ? (
        <ErrorRetryState message={error} onRetry={loadCatalog} isLoading={isLoading} />
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center select-none">
          <p className="text-sm font-semibold text-[#78716C] max-w-xs">
            {MESSAGES.EMPTY_SEARCH_NO_RESULTS}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredProducts.map((product) => (
            <CatalogProductCard
              key={product.id}
              product={product}
              onPriceClick={() => handlePriceClick(product)}
              onAddToStore={() => handleAddToStore(product)}
              onAddToList={() => onOpenAddToList(product)}
              isAddingToStore={addingProductIds.has(product.id)}
            />
          ))}
        </div>
      )}

      {/* Hoja de Historial de Precios */}
      <PriceHistorySheet
        isOpen={isHistorySheetOpen}
        product={selectedProductForHistory}
        onClose={handleCloseHistorySheet}
      />
    </div>
  );
}
