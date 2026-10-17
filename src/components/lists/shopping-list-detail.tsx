'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import {
  ArrowLeft,
  Trash2,
  Minus,
  Plus,
  Loader2,
  Check,
  Edit2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiClientError } from '@/lib/api/client';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatBs } from '@/lib/domain/format';
import { calculateListSummary, roundHalfUp2 } from '@/lib/domain/pricing';
import { ReorderControls } from '@/components/shared/reorder-controls';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { CardSkeleton } from '@/components/shared/card-skeleton';
import { ErrorRetryState } from '@/components/shared/error-retry-state';
import type {
  ShoppingListDetailDto,
  ShoppingListItemDto,
  InvoiceDto,
  CurrencyTag,
} from '@/types/contracts';

export interface ShoppingListDetailProps {
  listId: string;
  onBack: () => void;
  onFinalized: (invoice: InvoiceDto) => void;
  onListDeleted: () => void;
}

interface SortableListItemProps {
  item: ShoppingListItemDto;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateQuantity: (newQuantity: number) => void;
  onUpdateCurrency: (newCurrency: CurrencyTag) => void;
  onRequestDelete: () => void;
}

function SortableListItem({
  item,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onUpdateQuantity,
  onUpdateCurrency,
  onRequestDelete,
}: SortableListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-[#E7E0D5] rounded-2xl p-4 shadow-xs flex flex-col gap-3 select-text"
    >
      {/* Fila superior: Reordenamiento, Nombre y Botón Quitar */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <ReorderControls
            index={index}
            total={total}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            dragHandleProps={{ ...attributes, ...listeners }}
          />
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <h3 className="font-bold text-sm text-[#292524] break-words">
            {item.productName}
          </h3>
          {item.boxPriceBs === null ? (
            <p className="text-xs text-[#78716C] mt-0.5">
              <span className="font-semibold text-[#DC2626] bg-[#FEE2E2] px-1.5 py-0.5 rounded">
                {MESSAGES.PRICELESS}
              </span>
            </p>
          ) : item.currencyTag === 'VES' ? (
            <p className="text-xs text-[#78716C] mt-0.5">
              <span>Precio por caja: {formatBs(item.boxPriceBs)}</span>
            </p>
          ) : null}
        </div>

        <button
          type="button"
          aria-label={`Quitar ${item.productName} de la lista`}
          onClick={onRequestDelete}
          className="w-10 h-10 flex items-center justify-center text-[#DC2626] hover:bg-[#FEE2E2] active:scale-95 rounded-xl transition cursor-pointer shrink-0"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Fila inferior: Controles de cantidad, selector de moneda y total de línea */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E7E0D5]/60 flex-wrap">
        {/* Stepper de cantidad */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Disminuir cajas"
            disabled={item.quantity <= 1}
            onClick={() => onUpdateQuantity(Math.max(1, item.quantity - 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#F2EDE4] hover:bg-[#E7E0D5] active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-[#292524] transition cursor-pointer"
          >
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>

          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            value={item.quantity}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) {
                onUpdateQuantity(Math.max(1, Math.min(9999, val)));
              }
            }}
            className="w-14 h-9 text-center font-bold text-sm bg-white border border-[#E7E0D5] rounded-lg text-[#292524] focus:outline-none focus:border-[#2D6A4F] focus:ring-1 focus:ring-[#2D6A4F] transition"
          />

          <button
            type="button"
            aria-label="Aumentar cajas"
            disabled={item.quantity >= 9999}
            onClick={() => onUpdateQuantity(Math.min(9999, item.quantity + 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#F2EDE4] hover:bg-[#E7E0D5] active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-[#292524] transition cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Selector de moneda VES | USD */}
        <div className="flex items-center p-0.5 bg-[#F2EDE4] rounded-lg">
          <button
            type="button"
            onClick={() => onUpdateCurrency('VES')}
            className={`min-h-[32px] px-2.5 rounded-md text-xs font-bold transition cursor-pointer ${
              item.currencyTag === 'VES'
                ? 'bg-white text-[#2D6A4F] shadow-xs'
                : 'text-[#78716C] hover:text-[#292524]'
            }`}
          >
            VES
          </button>
          <button
            type="button"
            onClick={() => onUpdateCurrency('USD')}
            className={`min-h-[32px] px-2.5 rounded-md text-xs font-bold transition cursor-pointer ${
              item.currencyTag === 'USD'
                ? 'bg-white text-[#2D6A4F] shadow-xs'
                : 'text-[#78716C] hover:text-[#292524]'
            }`}
          >
            USD
          </button>
        </div>

        {/* Total de línea (solo para VES; en USD solo se muestra la etiqueta USD sin precio) */}
        <div className="text-right ml-auto">
          {item.currencyTag === 'USD' ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-[#E0E7FF] text-[#3730A3]">
              USD
            </span>
          ) : (
            <>
              <span className="block text-[10px] text-[#78716C]">Total línea</span>
              <span className="font-bold text-sm text-[#292524]">
                {item.lineTotalBs !== null ? formatBs(item.lineTotalBs) : '—'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ShoppingListDetail({
  listId,
  onBack,
  onFinalized,
  onListDeleted,
}: ShoppingListDetailProps) {
  const [list, setList] = useState<ShoppingListDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edición del nombre de la lista
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameText, setNameText] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // Modales de confirmación
  const [isConfirmDeleteListOpen, setIsConfirmDeleteListOpen] = useState(false);
  const [isDeletingList, setIsDeletingList] = useState(false);

  const [isConfirmFinalizeOpen, setIsConfirmFinalizeOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const [itemToDelete, setItemToDelete] = useState<ShoppingListItemDto | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

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

  // Cargar detalle de la lista
  const loadDetail = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.getShoppingListDetail(listId);

      // Si la lista ya fue finalizada por otro dispositivo o proceso previo, redirigir a factura (L1051)
      if (data.status === 'finalized') {
        const inv = await apiClient.getInvoiceDetail(listId);
        onFinalized(inv);
        return;
      }

      setList(data);
      setNameText(data.name);
    } catch (err) {
      console.error('[Load List Detail Error]', err);
      if (
        err instanceof ApiClientError &&
        (err.status === 404 || err.code === 'NOT_FOUND')
      ) {
        toast.error(MESSAGES.LIST_NOT_FOUND);
        onBack();
      } else {
        setError(MESSAGES.GENERIC_FETCH_ERROR);
      }
    } finally {
      setIsLoading(false);
    }
  }, [listId, onFinalized, onBack]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Guardar edición del nombre de la lista (L467, L770)
  const handleSaveName = async () => {
    if (!list) return;
    const trimmed = nameText.trim();
    if (!trimmed || trimmed === list.name) {
      setNameText(list.name);
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);
    try {
      await apiClient.updateShoppingList(listId, { name: trimmed });
      setList((prev) => (prev ? { ...prev, name: trimmed } : null));
      toast.success(MESSAGES.LIST_UPDATED);
      setIsEditingName(false);
    } catch (err) {
      console.error('[Update List Name Error]', err);
      toast.error(
        err instanceof ApiClientError ? err.message : MESSAGES.GENERIC_ERROR
      );
      setNameText(list.name);
    } finally {
      setIsSavingName(false);
    }
  };

  // Reordenamiento por arrastre (@dnd-kit)
  const handleDragEnd = async (event: DragEndEvent) => {
    if (!list) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = list.items.findIndex((it) => it.id === active.id);
    const newIndex = list.items.findIndex((it) => it.id === over.id);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const previousItems = [...list.items];
    const reordered = arrayMove(list.items, oldIndex, newIndex);
    setList({ ...list, items: reordered });

    try {
      const orderedIds = reordered.map((it) => it.id);
      await apiClient.reorderShoppingListItems(listId, orderedIds);
      toast.success(MESSAGES.ORDER_UPDATED);
    } catch (err) {
      console.error('[Drag Reorder Items Error]', err);
      toast.error(MESSAGES.ORDER_SAVE_ERROR);
      setList({ ...list, items: previousItems });
      loadDetail();
    }
  };

  // Reordenamiento por flechas Subir / Bajar
  const handleMoveArrow = async (currentIndex: number, direction: 'up' | 'down') => {
    if (!list) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.items.length) return;

    const previousItems = [...list.items];
    const reordered = arrayMove(list.items, currentIndex, targetIndex);
    setList({ ...list, items: reordered });

    try {
      const orderedIds = reordered.map((it) => it.id);
      await apiClient.reorderShoppingListItems(listId, orderedIds);
      // Con flechas no se muestra aviso de éxito (L742)
    } catch (err) {
      console.error('[Arrow Reorder Items Error]', err);
      toast.error(MESSAGES.ORDER_SAVE_ERROR);
      setList({ ...list, items: previousItems });
      loadDetail();
    }
  };

  // Actualización instantánea de cantidad (sin botón de guardar, L772)
  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    if (!list) return;

    const item = list.items.find((it) => it.id === itemId);
    if (!item || item.quantity === newQuantity) return;

    const updatedItems = list.items.map((it) => {
      if (it.id === itemId) {
        const lineTotalBs =
          it.boxPriceBs !== null ? roundHalfUp2(newQuantity * it.boxPriceBs) : null;
        return { ...it, quantity: newQuantity, lineTotalBs };
      }
      return it;
    });

    const summary = calculateListSummary(
      updatedItems.map((it) => ({
        currencyTag: it.currencyTag,
        boxPriceBs: it.boxPriceBs,
        quantity: it.quantity,
      }))
    );

    setList({
      ...list,
      items: updatedItems,
      totalBs: summary.totalBs,
      usdItemCount: summary.usdItemCount,
      pricelessItemCount: summary.pricelessItemCount,
    });

    try {
      await apiClient.updateShoppingListItem(listId, itemId, { quantity: newQuantity });
    } catch (err) {
      console.error('[Update Item Quantity Error]', err);
      toast.error(MESSAGES.GENERIC_ERROR);
      loadDetail();
    }
  };

  // Actualización instantánea de moneda VES | USD (sin botón de guardar, L772)
  const handleUpdateCurrency = async (itemId: string, newCurrency: CurrencyTag) => {
    if (!list) return;

    const item = list.items.find((it) => it.id === itemId);
    if (!item || item.currencyTag === newCurrency) return;

    const updatedItems = list.items.map((it) => {
      if (it.id === itemId) {
        return { ...it, currencyTag: newCurrency };
      }
      return it;
    });

    const summary = calculateListSummary(
      updatedItems.map((it) => ({
        currencyTag: it.currencyTag,
        boxPriceBs: it.boxPriceBs,
        quantity: it.quantity,
      }))
    );

    setList({
      ...list,
      items: updatedItems,
      totalBs: summary.totalBs,
      usdItemCount: summary.usdItemCount,
      pricelessItemCount: summary.pricelessItemCount,
    });

    try {
      await apiClient.updateShoppingListItem(listId, itemId, { currencyTag: newCurrency });
    } catch (err) {
      console.error('[Update Item Currency Error]', err);
      toast.error(MESSAGES.GENERIC_ERROR);
      loadDetail();
    }
  };

  // Quitar producto de la lista (confirmado)
  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete || !list) return;

    setIsDeletingItem(true);
    try {
      await apiClient.deleteShoppingListItem(listId, itemToDelete.id);
      toast.success(MESSAGES.PRODUCT_REMOVED_FROM_LIST);

      const remainingItems = list.items.filter((it) => it.id !== itemToDelete.id);
      const summary = calculateListSummary(
        remainingItems.map((it) => ({
          currencyTag: it.currencyTag,
          boxPriceBs: it.boxPriceBs,
          quantity: it.quantity,
        }))
      );

      setList({
        ...list,
        items: remainingItems,
        totalBs: summary.totalBs,
        usdItemCount: summary.usdItemCount,
        pricelessItemCount: summary.pricelessItemCount,
      });

      setItemToDelete(null);
    } catch (err) {
      console.error('[Delete Item Error]', err);
      toast.error(
        err instanceof ApiClientError ? err.message : MESSAGES.GENERIC_ERROR
      );
    } finally {
      setIsDeletingItem(false);
    }
  };

  // Eliminar la lista completa (confirmado)
  const handleConfirmDeleteList = async () => {
    setIsDeletingList(true);
    try {
      await apiClient.deleteShoppingList(listId);
      toast.success(MESSAGES.LIST_DELETED);
      setIsConfirmDeleteListOpen(false);
      onListDeleted();
    } catch (err) {
      console.error('[Delete List Error]', err);
      toast.error(
        err instanceof ApiClientError ? err.message : MESSAGES.GENERIC_ERROR
      );
    } finally {
      setIsDeletingList(false);
    }
  };

  // Finalizar lista (confirmado)
  const handleConfirmFinalize = async () => {
    setIsFinalizing(true);
    try {
      const invoice = await apiClient.finalizeShoppingList(listId);
      // Avisos en secuencia según L919
      toast.success(MESSAGES.LIST_FINALIZED);
      toast.success(MESSAGES.INVOICE_GENERATED);
      setIsConfirmFinalizeOpen(false);
      onFinalized(invoice);
    } catch (err) {
      console.error('[Finalize List Error]', err);
      setIsConfirmFinalizeOpen(false);

      if (err instanceof ApiClientError) {
        if (err.message.includes('vacía') || err.message.includes('productos')) {
          toast.error(MESSAGES.FINALIZE_ERROR_EMPTY);
        } else if (err.message.includes('PDF') || err.message.includes('activa')) {
          toast.error(MESSAGES.FINALIZE_ERROR_NO_ACTIVE_UPLOAD);
        } else if (err.message.includes('precio') || err.message.includes('Sin precio')) {
          toast.error(MESSAGES.FINALIZE_ERROR_PRICELESS);
        } else if (err.message.includes('finalizada')) {
          toast.info(MESSAGES.LIST_ALREADY_FINALIZED);
          loadDetail();
        } else {
          toast.error(err.message || MESSAGES.INVOICE_GENERATE_ERROR);
        }
      } else {
        toast.error(MESSAGES.INVOICE_GENERATE_ERROR);
      }
    } finally {
      setIsFinalizing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pt-2">
        <CardSkeleton count={3} heightClass="h-28" />
      </div>
    );
  }

  if (error || !list) {
    return <ErrorRetryState message={error ?? MESSAGES.GENERIC_FETCH_ERROR} onRetry={loadDetail} />;
  }

  return (
    <div className="flex flex-col gap-4 select-text pb-10">
      {/* Barra superior de navegación y acciones */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a compras"
          className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-bold text-[#2D6A4F] hover:text-[#1B4332] active:scale-95 transition cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          <span>Volver</span>
        </button>

        <button
          type="button"
          aria-label="Eliminar lista"
          onClick={() => setIsConfirmDeleteListOpen(true)}
          className="min-h-[44px] px-3 py-2 text-xs font-bold text-[#DC2626] hover:bg-[#FEE2E2] active:scale-95 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          <span>Eliminar</span>
        </button>
      </div>

      {/* Cabecera con Nombre editable de la lista */}
      <div className="bg-white border border-[#E7E0D5] rounded-2xl p-4 shadow-xs">
        {isEditingName ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameText}
              disabled={isSavingName}
              onChange={(e) => setNameText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') {
                  setNameText(list.name);
                  setIsEditingName(false);
                }
              }}
              autoFocus
              className="flex-1 min-h-[44px] px-3 py-2 bg-white border border-[#2D6A4F] rounded-xl text-base font-bold text-[#292524] focus:outline-none"
            />
            <button
              type="button"
              disabled={isSavingName}
              onClick={handleSaveName}
              className="w-11 h-11 flex items-center justify-center bg-[#2D6A4F] text-white rounded-xl hover:bg-[#1B4332] active:scale-95 transition cursor-pointer shrink-0"
            >
              {isSavingName ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-extrabold text-[#292524] break-words">
              {list.name}
            </h1>
            <button
              type="button"
              aria-label="Editar nombre de la lista"
              onClick={() => setIsEditingName(true)}
              className="w-9 h-9 flex items-center justify-center text-[#78716C] hover:text-[#292524] hover:bg-[#F2EDE4] active:scale-95 rounded-lg transition cursor-pointer shrink-0"
            >
              <Edit2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Lista de productos reordenables */}
      {list.items.length === 0 ? (
        <EmptyState
          title={MESSAGES.EMPTY_LIST_DETAIL_TITLE}
          description={MESSAGES.EMPTY_LIST_DETAIL_TEXT}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={list.items.map((it) => it.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {list.items.map((item, index) => (
                <SortableListItem
                  key={item.id}
                  item={item}
                  index={index}
                  total={list.items.length}
                  onMoveUp={() => handleMoveArrow(index, 'up')}
                  onMoveDown={() => handleMoveArrow(index, 'down')}
                  onUpdateQuantity={(qty) => handleUpdateQuantity(item.id, qty)}
                  onUpdateCurrency={(tag) => handleUpdateCurrency(item.id, tag)}
                  onRequestDelete={() => setItemToDelete(item)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Resumen y botón Finalizar lista (Sección 17: L773-L775) */}
      <div className="bg-white border border-[#E7E0D5] rounded-2xl p-5 shadow-sm mt-2 flex flex-col gap-4">
        {/* Advertencias de monedas USD o productos sin precio */}
        {(list.usdItemCount > 0 || list.pricelessItemCount > 0) && (
          <div className="flex flex-col gap-2 pt-1 text-xs">
            {list.usdItemCount > 0 && (
              <div className="flex items-center gap-2 text-[#78716C]">
                <span className="w-2 h-2 rounded-full bg-[#6366F1]" />
                <span>
                  {list.usdItemCount} {list.usdItemCount === 1 ? 'producto en USD no suma' : 'productos en USD no suman'} al total en bolívares.
                </span>
              </div>
            )}
            {list.pricelessItemCount > 0 && (
              <div className="flex items-center gap-2 text-[#DC2626] font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {list.pricelessItemCount} {list.pricelessItemCount === 1 ? 'producto sin precio' : 'productos sin precio'}. Asígnale precio para poder finalizar.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Total en bolívares */}
        <div className="flex items-center justify-between pt-2 border-t border-[#E7E0D5]">
          <div>
            <span className="block text-xs font-semibold text-[#78716C]">
              Total en bolívares
            </span>
            <span className="text-xl font-extrabold text-[#2D6A4F]">
              {formatBs(list.totalBs)}
            </span>
          </div>
          <div className="text-right text-xs text-[#78716C]">
            <span>{list.items.length} {list.items.length === 1 ? 'producto' : 'productos'}</span>
          </div>
        </div>

        {/* Botón Finalizar lista */}
        <button
          type="button"
          disabled={isFinalizing || list.items.length === 0}
          onClick={() => setIsConfirmFinalizeOpen(true)}
          className="w-full min-h-[44px] py-3 text-sm font-bold text-white bg-[#2D6A4F] hover:bg-[#1B4332] active:scale-95 disabled:opacity-50 rounded-xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
        >
          {isFinalizing && (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          )}
          <span>{MESSAGES.BUTTON_FINALIZE_LIST}</span>
        </button>
      </div>

      {/* Diálogo de confirmación: Quitar producto de la lista (L928-L931) */}
      <ConfirmDialog
        isOpen={itemToDelete !== null}
        title={MESSAGES.CONFIRM_REMOVE_FROM_LIST_TITLE}
        description={
          itemToDelete ? MESSAGES.confirmRemoveFromListText(itemToDelete.productName) : ''
        }
        confirmText={MESSAGES.CONFIRM_BUTTON_REMOVE}
        variant="destructive"
        isLoading={isDeletingItem}
        onConfirm={handleConfirmDeleteItem}
        onCancel={() => setItemToDelete(null)}
      />

      {/* Diálogo de confirmación: Eliminar lista (L933-L936) */}
      <ConfirmDialog
        isOpen={isConfirmDeleteListOpen}
        title={MESSAGES.CONFIRM_DELETE_LIST_TITLE}
        description={MESSAGES.confirmDeleteListText(list.name)}
        confirmText={MESSAGES.CONFIRM_BUTTON_DELETE}
        variant="destructive"
        isLoading={isDeletingList}
        onConfirm={handleConfirmDeleteList}
        onCancel={() => setIsConfirmDeleteListOpen(false)}
      />

      {/* Diálogo de confirmación: Finalizar lista (L938-L941) */}
      <ConfirmDialog
        isOpen={isConfirmFinalizeOpen}
        title={MESSAGES.CONFIRM_FINALIZE_LIST_TITLE}
        description={MESSAGES.confirmFinalizeListText(list.name)}
        confirmText={MESSAGES.CONFIRM_BUTTON_FINALIZE}
        isLoading={isFinalizing}
        onConfirm={handleConfirmFinalize}
        onCancel={() => setIsConfirmFinalizeOpen(false)}
      />
    </div>
  );
}
