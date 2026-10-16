'use client';

import React, { useState, useEffect } from 'react';
import { Minus, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { BottomSheet } from '@/components/shared/bottom-sheet';
import { CardSkeleton } from '@/components/shared/card-skeleton';
import { apiClient, ApiClientError } from '@/lib/api/client';
import { MESSAGES } from '@/lib/i18n/messages';
import type { CurrencyTag, ShoppingListSummaryDto } from '@/types/contracts';

export interface AddToListProductInput {
  id: string; // product_id
  name: string; // display name or custom name
}

export interface AddToListSheetProps {
  isOpen: boolean;
  product: AddToListProductInput | null;
  onClose: () => void;
  onAddedToList?: (listId: string) => void;
}

export function AddToListSheet({
  isOpen,
  product,
  onClose,
  onAddedToList,
}: AddToListSheetProps) {
  const [openLists, setOpenLists] = useState<ShoppingListSummaryDto[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [currencyTag, setCurrencyTag] = useState<CurrencyTag>('VES');

  const [isLoadingLists, setIsLoadingLists] = useState<boolean>(false);
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isCreatingList, setIsCreatingList] = useState<boolean>(false);

  // Carga de listas abiertas al abrir la hoja (Sección 17: L779-L789)
  useEffect(() => {
    if (isOpen && product) {
      setQuantity(1);
      setCurrencyTag('VES');

      const fetchOpenLists = async () => {
        setIsLoadingLists(true);
        try {
          const allLists = await apiClient.getShoppingLists();
          const open = allLists.filter((l) => l.status === 'open');
          setOpenLists(open);
          // Por defecto la lista abierta más reciente (L784)
          if (open.length > 0) {
            setSelectedListId(open[0].id);
          } else {
            setSelectedListId('');
          }
        } catch (err) {
          console.error('[AddToListSheet Fetch Error]', err);
          toast.error(MESSAGES.GENERIC_FETCH_ERROR);
        } finally {
          setIsLoadingLists(false);
        }
      };

      fetchOpenLists();
    }
  }, [isOpen, product]);

  if (!product) return null;

  // Crear una nueva lista abierta directamente desde la hoja (L788, L971-L974)
  const handleCreateNewList = async () => {
    setIsCreatingList(true);
    try {
      const newList = await apiClient.createShoppingList();
      toast.success(MESSAGES.LIST_CREATED);
      setOpenLists((prev) => [newList, ...prev]);
      setSelectedListId(newList.id);
    } catch (err) {
      console.error('[Create List In Sheet Error]', err);
      toast.error(
        err instanceof ApiClientError ? err.message : MESSAGES.GENERIC_ERROR
      );
    } finally {
      setIsCreatingList(false);
    }
  };

  // Manejo de cantidades
  const handleDecreaseQuantity = () => {
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const handleIncreaseQuantity = () => {
    setQuantity((prev) => Math.min(9999, prev + 1));
  };

  const handleQuantityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) {
      setQuantity(1);
    } else {
      setQuantity(Math.max(1, Math.min(9999, val)));
    }
  };

  // Agregar producto a la lista seleccionada
  const handleAddProduct = async () => {
    if (!selectedListId) return;

    setIsAdding(true);
    try {
      await apiClient.addShoppingListItem(selectedListId, {
        productId: product.id,
        quantity,
        currencyTag,
      });

      toast.success(MESSAGES.PRODUCT_ADDED_TO_LIST);
      onAddedToList?.(selectedListId);
      onClose();
    } catch (err) {
      console.error('[Add Product To List Error]', err);
      if (
        (err instanceof ApiClientError && (err.status === 409 || err.code === 'CONFLICT')) ||
        (err instanceof Error && err.message.includes(MESSAGES.PRODUCT_ALREADY_IN_LIST))
      ) {
        toast.info(MESSAGES.PRODUCT_ALREADY_IN_LIST);
        onClose();
      } else {
        toast.error(
          err instanceof ApiClientError ? err.message : MESSAGES.GENERIC_ERROR
        );
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      title={MESSAGES.SHEET_ADD_TO_LIST_TITLE}
      subtitle={product.name}
      onClose={onClose}
      maxHeightClass="max-h-[85vh]"
    >
      <div className="flex flex-col gap-5 pb-2">
        {isLoadingLists ? (
          <div className="py-2">
            <CardSkeleton count={2} heightClass="h-16" />
          </div>
        ) : openLists.length === 0 ? (
          // Caso sin listas abiertas: ofrece crear una en ese mismo momento (L788, L971-L974)
          <div className="flex flex-col items-center justify-center py-6 text-center select-none">
            <p className="text-sm font-semibold text-[#78716C] mb-4">
              {MESSAGES.EMPTY_SHEET_NO_OPEN_LISTS}
            </p>
            <button
              type="button"
              disabled={isCreatingList}
              onClick={handleCreateNewList}
              className="min-h-[44px] px-6 py-2.5 text-sm font-bold text-white bg-[#2D6A4F] hover:bg-[#1B4332] active:scale-95 disabled:opacity-50 rounded-xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {isCreatingList && (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              )}
              <span>{MESSAGES.BUTTON_CREATE_LIST}</span>
            </button>
          </div>
        ) : (
          <>
            {/* 1. Selector de lista abierta */}
            <div>
              <label
                htmlFor="select-open-list"
                className="block text-sm font-bold text-[#292524] mb-1.5"
              >
                Lista de compras
              </label>
              <select
                id="select-open-list"
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-white border border-[#E7E0D5] rounded-xl text-sm font-semibold text-[#292524] focus:outline-none focus:border-[#2D6A4F] focus:ring-1 focus:ring-[#2D6A4F] transition cursor-pointer"
              >
                {openLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Cantidad de cajas */}
            <div>
              <label
                htmlFor="input-box-quantity"
                className="block text-sm font-bold text-[#292524] mb-1.5"
              >
                {MESSAGES.LIST_CONTROL_BOX_QUANTITY}
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Disminuir cantidad"
                  disabled={quantity <= 1 || isAdding}
                  onClick={handleDecreaseQuantity}
                  className="w-12 h-11 flex items-center justify-center rounded-xl bg-[#F2EDE4] hover:bg-[#E7E0D5] active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-[#292524] transition cursor-pointer"
                >
                  <Minus className="w-5 h-5" aria-hidden="true" />
                </button>

                <input
                  id="input-box-quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={9999}
                  value={quantity}
                  disabled={isAdding}
                  onChange={handleQuantityInputChange}
                  className="w-24 h-11 text-center font-extrabold text-base bg-white border border-[#E7E0D5] rounded-xl text-[#292524] focus:outline-none focus:border-[#2D6A4F] focus:ring-1 focus:ring-[#2D6A4F] transition"
                />

                <button
                  type="button"
                  aria-label="Aumentar cantidad"
                  disabled={quantity >= 9999 || isAdding}
                  onClick={handleIncreaseQuantity}
                  className="w-12 h-11 flex items-center justify-center rounded-xl bg-[#F2EDE4] hover:bg-[#E7E0D5] active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-[#292524] transition cursor-pointer"
                >
                  <Plus className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* 3. Selector de dos opciones VES | USD */}
            <div>
              <span className="block text-sm font-bold text-[#292524] mb-1.5">
                {MESSAGES.LIST_CONTROL_CURRENCY}
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#F2EDE4] rounded-xl max-w-xs">
                <button
                  type="button"
                  onClick={() => setCurrencyTag('VES')}
                  className={`min-h-[38px] py-1.5 px-3 rounded-lg text-sm font-bold transition cursor-pointer ${
                    currencyTag === 'VES'
                      ? 'bg-white text-[#2D6A4F] shadow-xs'
                      : 'text-[#78716C] hover:text-[#292524]'
                  }`}
                >
                  VES
                </button>
                <button
                  type="button"
                  onClick={() => setCurrencyTag('USD')}
                  className={`min-h-[38px] py-1.5 px-3 rounded-lg text-sm font-bold transition cursor-pointer ${
                    currencyTag === 'USD'
                      ? 'bg-white text-[#2D6A4F] shadow-xs'
                      : 'text-[#78716C] hover:text-[#292524]'
                  }`}
                >
                  USD
                </button>
              </div>
            </div>

            {/* 4. Botón Agregar */}
            <div className="pt-2">
              <button
                type="button"
                disabled={!selectedListId || isAdding}
                onClick={handleAddProduct}
                className="w-full min-h-[44px] py-3 text-sm font-bold text-white bg-[#2D6A4F] hover:bg-[#1B4332] active:scale-95 disabled:opacity-50 rounded-xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isAdding && (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                )}
                <span>{MESSAGES.SHEET_ADD_BUTTON}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
