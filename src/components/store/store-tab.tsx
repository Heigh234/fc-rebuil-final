'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner';

import type { StoreProductDto } from '@/types/contracts';
import { apiClient } from '@/lib/api/client';
import { MESSAGES } from '@/lib/i18n/messages';
import { matchesMultiWordQuery } from '@/lib/domain/search';
import { useSilentPolling } from '@/hooks/use-silent-polling';
import { EmptyState } from '@/components/shared/empty-state';
import { CardSkeleton } from '@/components/shared/card-skeleton';
import { ErrorRetryState } from '@/components/shared/error-retry-state';
import { StoreProductCard } from './store-product-card';
import { EditStoreProductSheet } from './edit-store-product-sheet';

export interface StoreTabProps {
  onNavigateToCatalog: () => void;
  onOpenAddToList: (product: StoreProductDto) => void;
  onSheetOpenChange?: (isOpen: boolean) => void;
  onStoreChanged?: () => void;
  isStickySearch?: boolean;
}

interface SortableProductItemProps {
  product: StoreProductDto;
  index: number;
  total: number;
  showReorderControls: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onAddToList: () => void;
}

function SortableProductItem({
  product,
  index,
  total,
  showReorderControls,
  onMoveUp,
  onMoveDown,
  onEdit,
  onAddToList,
}: SortableProductItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id, disabled: !showReorderControls });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <StoreProductCard
        product={product}
        index={index}
        total={total}
        showReorderControls={showReorderControls}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        dragHandleProps={{ ...attributes, ...listeners }}
        onEdit={onEdit}
        onAddToList={onAddToList}
      />
    </div>
  );
}

export function StoreTab({
  onNavigateToCatalog,
  onOpenAddToList,
  onSheetOpenChange,
  onStoreChanged,
  isStickySearch = false,
}: StoreTabProps) {
  const [products, setProducts] = useState<StoreProductDto[]>([]);
  const [catalogPrices, setCatalogPrices] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Búsqueda local
  const [searchQuery, setSearchQuery] = useState('');

  // Hoja inferior de edición
  const [editingProduct, setEditingProduct] = useState<StoreProductDto | null>(null);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);

  // Estado de arrastre activo para pausar sincronización silenciosa
  const [isDragging, setIsDragging] = useState(false);

  // Sensores de arrastre @dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Carga de productos de la tienda y precios del catálogo
  const fetchProducts = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.getStoreProducts();
      setProducts(data);

      // Carga silenciosa en segundo plano de precios del catálogo activo
      try {
        const catalog = await apiClient.getCatalog();
        const map: Record<string, number> = {};
        for (const item of catalog) {
          map[item.id] = item.currentPriceBs;
        }
        setCatalogPrices(map);
      } catch {
        // Si no hay catálogo activo se ignora silenciosamente
      }
    } catch (err) {
      console.error('[StoreTab Fetch Error]', err);
      setError(MESSAGES.GENERIC_FETCH_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Sincronización periódica multi-dispositivo (pausada durante edición o arrastre)
  useSilentPolling(fetchProducts, {
    intervalMs: 30_000,
    paused: isEditSheetOpen || isDragging || isLoading,
  });

  // Apertura y cierre de hoja de edición con notificación al padre
  const handleOpenEdit = (product: StoreProductDto) => {
    setEditingProduct(product);
    setIsEditSheetOpen(true);
    onSheetOpenChange?.(true);
  };

  const handleCloseEdit = () => {
    setIsEditSheetOpen(false);
    setEditingProduct(null);
    onSheetOpenChange?.(false);
  };

  const handleProductSaved = (updated: StoreProductDto) => {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    onStoreChanged?.();
  };

  const handleProductDeleted = (deletedId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== deletedId));
    onStoreChanged?.();
  };

  // Reordenamiento por arrastre (@dnd-kit)
  const handleDragEnd = async (event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = products.findIndex((p) => p.id === active.id);
    const newIndex = products.findIndex((p) => p.id === over.id);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const previousProducts = [...products];
    const reordered = arrayMove(products, oldIndex, newIndex);
    setProducts(reordered);

    try {
      const orderedIds = reordered.map((p) => p.id);
      await apiClient.reorderStoreProducts(orderedIds);
      toast.success(MESSAGES.ORDER_UPDATED);
    } catch (err) {
      console.error('[Drag Reorder Error]', err);
      toast.error(MESSAGES.ORDER_SAVE_ERROR);
      setProducts(previousProducts);
      fetchProducts();
    }
  };

  // Reordenamiento por flechas Subir / Bajar (L740-L742)
  const handleMove = async (currentIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= products.length) return;

    const previousProducts = [...products];
    const reordered = arrayMove(products, currentIndex, targetIndex);
    setProducts(reordered);

    try {
      const orderedIds = reordered.map((p) => p.id);
      await apiClient.reorderStoreProducts(orderedIds);
      // Con las flechas no se muestra aviso de éxito (L742)
    } catch (err) {
      console.error('[Arrow Reorder Error]', err);
      toast.error(MESSAGES.ORDER_SAVE_ERROR);
      setProducts(previousProducts);
      fetchProducts();
    }
  };

  // Filtro de búsqueda local con matchesMultiWordQuery
  const isSearching = searchQuery.trim().length > 0;

  const filteredProducts = useMemo(() => {
    if (!isSearching) return products;
    return products.filter((p) =>
      matchesMultiWordQuery(searchQuery, [p.customName, p.catalogDisplayName])
    );
  }, [products, searchQuery, isSearching]);

  // Si está cargando inicialmente
  if (isLoading) {
    return (
      <div className="pt-2">
        <CardSkeleton count={3} heightClass="h-32" />
      </div>
    );
  }

  // Si hubo error al cargar los datos
  if (error) {
    return <ErrorRetryState message={error} onRetry={fetchProducts} />;
  }

  // Si no hay productos en la tienda (Estado vacío L950-L952)
  if (products.length === 0) {
    return (
      <EmptyState
        title={MESSAGES.EMPTY_STORE_TITLE}
        actionLabel={MESSAGES.EMPTY_STORE_ACTION}
        onAction={onNavigateToCatalog}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Buscador local */}
      <div
        className={
          isStickySearch
            ? 'sticky top-28 z-20 bg-[#FFFBF5] py-2 -mx-4 px-4 border-b border-[#E7E0D5] shadow-xs'
            : ''
        }
      >
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#78716C]">
            <Search className="w-4 h-4" aria-hidden="true" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar en mi tienda..."
            className="w-full min-h-[44px] pl-10 pr-10 py-2.5 bg-white border border-[#E7E0D5] rounded-xl text-sm text-[#292524] placeholder-[#78716C] focus:outline-none focus:border-[#2D6A4F] focus:ring-1 focus:ring-[#2D6A4F] transition"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#78716C] hover:text-[#292524] transition cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Lista de productos o mensaje de búsqueda sin resultados */}
      {filteredProducts.length === 0 ? (
        <div className="py-12 text-center text-sm font-semibold text-[#78716C] select-none">
          {MESSAGES.EMPTY_SEARCH_NO_RESULTS}
        </div>
      ) : isSearching ? (
        // Modo búsqueda: Reordenamiento oculto
        <div className="flex flex-col gap-3">
          {filteredProducts.map((product, index) => (
            <StoreProductCard
              key={product.id}
              product={product}
              index={index}
              total={filteredProducts.length}
              showReorderControls={false}
              onMoveUp={() => {}}
              onMoveDown={() => {}}
              onEdit={() => handleOpenEdit(product)}
              onAddToList={() => onOpenAddToList(product)}
            />
          ))}
        </div>
      ) : (
        // Modo normal sin búsqueda: Controles de arrastre y flechas habilitados
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setIsDragging(false)}
        >
          <SortableContext
            items={products.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {products.map((product, index) => (
                <SortableProductItem
                  key={product.id}
                  product={product}
                  index={index}
                  total={products.length}
                  showReorderControls={true}
                  onMoveUp={() => handleMove(index, 'up')}
                  onMoveDown={() => handleMove(index, 'down')}
                  onEdit={() => handleOpenEdit(product)}
                  onAddToList={() => onOpenAddToList(product)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Hoja inferior para editar producto */}
      <EditStoreProductSheet
        isOpen={isEditSheetOpen}
        product={editingProduct}
        catalogPriceBs={
          editingProduct ? catalogPrices[editingProduct.productId] : undefined
        }
        onClose={handleCloseEdit}
        onSaved={handleProductSaved}
        onDeleted={handleProductDeleted}
      />
    </div>
  );
}
