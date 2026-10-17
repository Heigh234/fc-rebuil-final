'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Minus, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { BottomSheet } from '@/components/shared/bottom-sheet';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiClient, ApiClientError } from '@/lib/api/client';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  formatBs,
  formatMarginPercent,
  parseLocalizedDecimal,
} from '@/lib/domain/format';
import { resolveStoreProductPricing } from '@/lib/domain/pricing';
import type { StoreProductDto } from '@/types/contracts';

export interface EditStoreProductSheetProps {
  isOpen: boolean;
  product: StoreProductDto | null;
  catalogPriceBs?: number | null;
  onClose: () => void;
  onSaved: (updated: StoreProductDto) => void;
  onDeleted: (deletedId: string) => void;
}

export function EditStoreProductSheet({
  isOpen,
  product,
  catalogPriceBs,
  onClose,
  onSaved,
  onDeleted,
}: EditStoreProductSheetProps) {
  // Estado local del formulario
  const [customName, setCustomName] = useState('');
  const [manualPriceStr, setManualPriceStr] = useState('');
  const [unitsPerBox, setUnitsPerBox] = useState(1);
  const [marginStrings, setMarginStrings] = useState<string[]>(['0']);

  // Marcadores de interacción (onBlur) para mostrar errores solo al salir del campo (L734)
  const [touchedName, setTouchedName] = useState(false);
  const [touchedPrice, setTouchedPrice] = useState(false);
  const [touchedUnits, setTouchedUnits] = useState(false);
  const [touchedMargins, setTouchedMargins] = useState(false);

  // Estados asíncronos y diálogo de confirmación
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // Inicializar o restablecer formulario al abrir o cambiar de producto
  useEffect(() => {
    if (isOpen && product) {
      setCustomName(product.customName);
      setManualPriceStr(
        product.manualPriceBs != null
          ? product.manualPriceBs.toString().replace('.', ',')
          : ''
      );
      setUnitsPerBox(product.unitsPerBox);
      setMarginStrings(
        product.margins.length > 0
          ? product.margins.map((m) => m.toString().replace('.', ','))
          : ['0']
      );

      setTouchedName(false);
      setTouchedPrice(false);
      setTouchedUnits(false);
      setTouchedMargins(false);
      setIsConfirmDeleteOpen(false);
    }
  }, [isOpen, product]);

  // Detección de cambios sin guardar (isDirty) para preventOutsideClose (L735)
  const isDirty = useMemo(() => {
    if (!product) return false;
    const initialPriceStr =
      product.manualPriceBs != null
        ? product.manualPriceBs.toString().replace('.', ',')
        : '';
    const initialMarginsStr = JSON.stringify(
      product.margins.map((m) => m.toString().replace('.', ','))
    );
    const currentMarginsStr = JSON.stringify(marginStrings);

    return (
      customName !== product.customName ||
      manualPriceStr !== initialPriceStr ||
      unitsPerBox !== product.unitsPerBox ||
      currentMarginsStr !== initialMarginsStr
    );
  }, [product, customName, manualPriceStr, unitsPerBox, marginStrings]);

  // Validaciones campo por campo según Sección 18 (L877-L884)
  const nameError = useMemo(() => {
    const trimmed = customName.trim();
    if (trimmed.length === 0) return MESSAGES.ERROR_NAME_REQUIRED;
    if (trimmed.length > 200) return MESSAGES.ERROR_NAME_TOO_LONG;
    return null;
  }, [customName]);

  const priceError = useMemo(() => {
    const trimmed = manualPriceStr.trim();
    if (trimmed.length === 0) return null; // Campo opcional
    const parsed = parseLocalizedDecimal(trimmed);
    if (parsed === null || parsed <= 0) return MESSAGES.ERROR_PRICE_POSITIVE;
    return null;
  }, [manualPriceStr]);

  const unitsError = useMemo(() => {
    if (
      isNaN(unitsPerBox) ||
      !Number.isInteger(unitsPerBox) ||
      unitsPerBox < 1 ||
      unitsPerBox > 9999
    ) {
      return MESSAGES.ERROR_UNITS_RANGE;
    }
    return null;
  }, [unitsPerBox]);

  const marginsError = useMemo(() => {
    if (marginStrings.length < 1) return MESSAGES.ERROR_MARGIN_MIN;
    if (marginStrings.length > 5) return MESSAGES.ERROR_MARGIN_MAX;

    const parsedList: number[] = [];
    for (const mStr of marginStrings) {
      const parsed = parseLocalizedDecimal(mStr);
      if (parsed === null || isNaN(parsed) || parsed < 0 || parsed > 500) {
        return MESSAGES.ERROR_MARGIN_RANGE;
      }
      parsedList.push(parsed);
    }

    if (new Set(parsedList).size !== parsedList.length) {
      return MESSAGES.ERROR_MARGIN_DUPLICATE;
    }

    return null;
  }, [marginStrings]);

  const hasErrors = Boolean(nameError || priceError || unitsError || marginsError);

  // Vista previa en vivo recalculada con resolveStoreProductPricing (Bloque 5, L729)
  const previewPricing = useMemo(() => {
    if (!product) {
      return { baseBoxPriceBs: null, unitPriceBs: null, salePrices: [] };
    }

    const currentManualPrice =
      manualPriceStr.trim().length > 0
        ? parseLocalizedDecimal(manualPriceStr)
        : null;

    const effectiveCatalogPrice =
      catalogPriceBs !== undefined
        ? catalogPriceBs
        : product.manualPriceBs === null
        ? product.baseBoxPriceBs
        : null;

    const validUnits =
      Number.isInteger(unitsPerBox) && unitsPerBox > 0 ? unitsPerBox : 1;

    const validMargins = marginStrings
      .map((s) => parseLocalizedDecimal(s))
      .filter((n): n is number => n !== null && n >= 0 && n <= 500);

    return resolveStoreProductPricing({
      manualPriceBs: currentManualPrice,
      catalogPriceBs: effectiveCatalogPrice,
      unitsPerBox: validUnits,
      margins: validMargins,
    });
  }, [product, manualPriceStr, catalogPriceBs, unitsPerBox, marginStrings]);

  if (!product) return null;

  // Manejadores de márgenes
  const handleAddMargin = () => {
    if (marginStrings.length >= 5) return;

    const parsedCurrent = marginStrings
      .map((s) => parseLocalizedDecimal(s))
      .filter((n): n is number => n !== null);

    const suggestions = [10, 20, 30, 40, 50, 15, 25, 35, 5];
    const nextVal =
      suggestions.find((c) => !parsedCurrent.includes(c)) ??
      (parsedCurrent.length > 0 ? Math.max(...parsedCurrent) + 10 : 10);

    setMarginStrings((prev) => [...prev, nextVal.toString()]);
  };

  const handleRemoveMargin = (index: number) => {
    if (marginStrings.length <= 1) return;
    setMarginStrings((prev) => prev.filter((_, i) => i !== index));
    setTouchedMargins(true);
  };

  const handleMarginChange = (index: number, val: string) => {
    setMarginStrings((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  // Guardar cambios
  const handleSave = async () => {
    setTouchedName(true);
    setTouchedPrice(true);
    setTouchedUnits(true);
    setTouchedMargins(true);

    if (hasErrors) return;

    const parsedManual =
      manualPriceStr.trim().length > 0
        ? parseLocalizedDecimal(manualPriceStr)
        : null;

    const parsedMargins = marginStrings.map((s) => parseLocalizedDecimal(s)!);

    setIsSaving(true);
    try {
      const updated = await apiClient.updateStoreProduct(product.id, {
        customName: customName.trim(),
        manualPriceBs: parsedManual,
        unitsPerBox,
        margins: parsedMargins,
      });

      toast.success(MESSAGES.PRODUCT_UPDATED);
      onSaved(updated);
      onClose();
    } catch (err) {
      console.error('[Save Store Product Error]', err);
      toast.error(
        err instanceof ApiClientError ? err.message : MESSAGES.GENERIC_ERROR
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Eliminar producto de la tienda
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await apiClient.deleteStoreProduct(product.id);
      toast.success(MESSAGES.PRODUCT_REMOVED_FROM_STORE);
      setIsConfirmDeleteOpen(false);
      onDeleted(product.id);
      onClose();
    } catch (err) {
      console.error('[Delete Store Product Error]', err);
      toast.error(
        err instanceof ApiClientError ? err.message : MESSAGES.GENERIC_ERROR
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Márgenes filtrados para la vista previa
  const validMarginsList = marginStrings
    .map((s) => parseLocalizedDecimal(s))
    .filter((n): n is number => n !== null && n >= 0 && n <= 500);

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        title={MESSAGES.EDIT_PRODUCT_TITLE}
        onClose={onClose}
        preventOutsideClose={isDirty}
        maxHeightClass="max-h-[92vh]"
      >
        <div className="flex flex-col gap-5 pb-2">
          {/* ================================================================= */}
          {/* Bloque 1: Nombre en tu tienda (L725) */}
          {/* ================================================================= */}
          <div>
            <label
              htmlFor="field-store-name"
              className="block text-sm font-bold text-[#292524] mb-1.5"
            >
              {MESSAGES.FIELD_STORE_NAME}
            </label>
            <input
              id="field-store-name"
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onBlur={() => setTouchedName(true)}
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-white border border-[#E7E0D5] rounded-xl text-base text-[#292524] font-semibold focus:outline-none focus:border-[#2D6A4F] focus:ring-1 focus:ring-[#2D6A4F] transition"
            />
            {/* Nombre del catálogo en texto atenuado (#78716C) */}
            <p className="text-xs text-[#78716C] mt-1 break-words">
              {product.catalogDisplayName}
            </p>
            {touchedName && nameError && (
              <p className="text-xs text-[#DC2626] font-medium mt-1">
                {nameError}
              </p>
            )}
          </div>

          {/* ================================================================= */}
          {/* Bloque 2: Precio manual por caja (Bs) (L726) */}
          {/* ================================================================= */}
          <div>
            <label
              htmlFor="field-manual-price"
              className="block text-sm font-bold text-[#292524] mb-1.5"
            >
              {MESSAGES.FIELD_MANUAL_PRICE}
            </label>
            <input
              id="field-manual-price"
              type="text"
              inputMode="decimal"
              placeholder="Opcional"
              value={manualPriceStr}
              onChange={(e) => setManualPriceStr(e.target.value)}
              onBlur={() => setTouchedPrice(true)}
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-white border border-[#E7E0D5] rounded-xl text-base text-[#292524] tabular-nums font-semibold focus:outline-none focus:border-[#2D6A4F] focus:ring-1 focus:ring-[#2D6A4F] transition"
            />
            {/* Texto de ayuda exacto */}
            <p className="text-xs text-[#78716C] mt-1">
              {MESSAGES.HELP_MANUAL_PRICE}
            </p>
            {touchedPrice && priceError && (
              <p className="text-xs text-[#DC2626] font-medium mt-1">
                {priceError}
              </p>
            )}
          </div>

          {/* ================================================================= */}
          {/* Bloque 3: Unidades por caja (L727) */}
          {/* ================================================================= */}
          <div>
            <label
              htmlFor="field-units-per-box"
              className="block text-sm font-bold text-[#292524] mb-1.5"
            >
              {MESSAGES.FIELD_UNITS_PER_BOX}
            </label>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label="Disminuir unidades"
                disabled={unitsPerBox <= 1}
                onClick={() => {
                  setUnitsPerBox((prev) => Math.max(1, prev - 1));
                  setTouchedUnits(true);
                }}
                className="w-12 h-12 flex items-center justify-center rounded-xl bg-[#F2EDE4] hover:bg-[#E7E0D5] active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-[#292524] font-bold transition cursor-pointer select-none shrink-0"
              >
                <Minus className="w-5 h-5" aria-hidden="true" />
              </button>

              <input
                id="field-units-per-box"
                type="text"
                inputMode="numeric"
                value={unitsPerBox === 0 ? '' : unitsPerBox}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '');
                  setUnitsPerBox(cleaned === '' ? 0 : parseInt(cleaned, 10));
                }}
                onBlur={() => setTouchedUnits(true)}
                className="flex-1 min-h-[48px] text-center font-bold text-[#292524] tabular-nums bg-white border border-[#E7E0D5] rounded-xl px-3 py-2 text-lg focus:outline-none focus:border-[#2D6A4F] focus:ring-1 focus:ring-[#2D6A4F] transition"
              />

              <button
                type="button"
                aria-label="Aumentar unidades"
                disabled={unitsPerBox >= 9999}
                onClick={() => {
                  setUnitsPerBox((prev) => Math.min(9999, prev + 1));
                  setTouchedUnits(true);
                }}
                className="w-12 h-12 flex items-center justify-center rounded-xl bg-[#F2EDE4] hover:bg-[#E7E0D5] active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-[#292524] font-bold transition cursor-pointer select-none shrink-0"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            {touchedUnits && unitsError && (
              <p className="text-xs text-[#DC2626] font-medium mt-1">
                {unitsError}
              </p>
            )}
          </div>

          {/* ================================================================= */}
          {/* Bloque 4: Márgenes de ganancia (L728) */}
          {/* ================================================================= */}
          <div>
            <label className="block text-sm font-bold text-[#292524] mb-1.5">
              {MESSAGES.FIELD_MARGINS}
            </label>
            <div className="flex flex-col gap-2">
              {marginStrings.map((mVal, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={mVal}
                      onChange={(e) => handleMarginChange(idx, e.target.value)}
                      onBlur={() => setTouchedMargins(true)}
                      className="w-full min-h-[44px] pr-9 pl-3.5 py-2.5 bg-white border border-[#E7E0D5] rounded-xl text-base font-semibold tabular-nums text-[#292524] focus:outline-none focus:border-[#2D6A4F] focus:ring-1 focus:ring-[#2D6A4F] transition"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#78716C] pointer-events-none select-none">
                      %
                    </span>
                  </div>

                  {/* Botón Quitar margen (oculto cuando queda 1 solo margen) */}
                  {marginStrings.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMargin(idx)}
                      className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] active:scale-95 rounded-xl transition cursor-pointer select-none shrink-0"
                    >
                      {MESSAGES.BUTTON_REMOVE_MARGIN}
                    </button>
                  )}
                </div>
              ))}

              {touchedMargins && marginsError && (
                <p className="text-xs text-[#DC2626] font-medium mt-0.5">
                  {marginsError}
                </p>
              )}

              {/* Botón Agregar margen (desactivado con 5 márgenes) */}
              <button
                type="button"
                onClick={handleAddMargin}
                disabled={marginStrings.length >= 5}
                className="min-h-[44px] w-full border border-dashed border-[#2D6A4F] text-[#2D6A4F] bg-[#D8F3E3]/40 hover:bg-[#D8F3E3] active:scale-98 disabled:opacity-40 disabled:pointer-events-none rounded-xl text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 mt-1 select-none"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>{MESSAGES.BUTTON_ADD_MARGIN}</span>
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* Bloque 5: Así quedarían tus precios (L729) */}
          {/* ================================================================= */}
          <div className="bg-[#FFFBF5] border border-[#E7E0D5] rounded-2xl p-4 flex flex-col gap-2.5">
            <h4 className="text-xs font-bold text-[#78716C] uppercase tracking-wider">
              {MESSAGES.PREVIEW_TITLE}
            </h4>

            {previewPricing.baseBoxPriceBs !== null ? (
              <div className="flex flex-col gap-1.5 text-base">
                <div className="flex items-baseline gap-1.5 text-[#78716C] flex-wrap">
                  <span>{MESSAGES.PREVIEW_BOX_PRICE}:</span>
                  <span className="font-bold text-[#292524] tabular-nums">
                    {formatBs(previewPricing.baseBoxPriceBs)}
                  </span>
                </div>

                <div className="flex items-baseline gap-1.5 text-[#78716C] flex-wrap">
                  <span>{MESSAGES.PREVIEW_UNIT_PRICE}:</span>
                  <span className="font-bold text-[#292524] tabular-nums">
                    {previewPricing.unitPriceBs !== null
                      ? formatBs(previewPricing.unitPriceBs)
                      : '-'}
                  </span>
                </div>

                {previewPricing.salePrices.map((sp, idx) => (
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
            ) : (
              <div className="flex flex-col gap-1.5 text-base">
                <div className="flex items-baseline gap-1.5 text-[#78716C] flex-wrap">
                  <span>{MESSAGES.PREVIEW_BOX_PRICE}:</span>
                  <span className="text-[#78716C] font-semibold text-xs px-2 py-0.5 bg-[#F2EDE4] rounded-md">
                    {MESSAGES.PRICELESS}
                  </span>
                </div>

                <div className="flex items-baseline gap-1.5 text-[#78716C] flex-wrap">
                  <span>{MESSAGES.PREVIEW_UNIT_PRICE}:</span>
                  <span className="text-[#78716C] font-semibold text-xs px-2 py-0.5 bg-[#F2EDE4] rounded-md">
                    {MESSAGES.PRICELESS}
                  </span>
                </div>

                {validMarginsList.map((margin, idx) => (
                  <div
                    key={idx}
                    className="flex items-baseline gap-1.5 text-base text-[#78716C] flex-wrap"
                  >
                    <span>
                      {MESSAGES.previewSalePriceWithMargin(
                        formatMarginPercent(margin).replace('%', '')
                      )}:
                    </span>
                    <span className="text-[#78716C] font-semibold text-xs px-2 py-0.5 bg-[#F2EDE4] rounded-md">
                      {MESSAGES.PRICELESS}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* Botones inferiores: Guardar, Cancelar y Quitar de mi tienda (L731) */}
          {/* ================================================================= */}
          <div className="flex flex-col gap-3 pt-3 border-t border-[#E7E0D5]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-[#292524] bg-[#F2EDE4] hover:bg-[#E7E0D5] active:scale-95 disabled:opacity-50 rounded-xl transition cursor-pointer text-center"
              >
                {MESSAGES.BUTTON_CANCEL}
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || hasErrors}
                className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-bold text-white bg-[#2D6A4F] hover:bg-[#1B4332] active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2 text-center"
              >
                {isSaving && (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                )}
                <span>{MESSAGES.BUTTON_SAVE}</span>
              </button>
            </div>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setIsConfirmDeleteOpen(true)}
                disabled={isSaving}
                className="text-sm font-bold text-[#DC2626] hover:underline p-2 rounded-lg cursor-pointer transition select-none"
              >
                {MESSAGES.DESTRUCTIVE_REMOVE_FROM_STORE}
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Diálogo de confirmación para Quitar de mi tienda (L923-L926) */}
      <ConfirmDialog
        isOpen={isConfirmDeleteOpen}
        title={MESSAGES.CONFIRM_REMOVE_FROM_STORE_TITLE}
        description={MESSAGES.confirmRemoveFromStoreText(
          customName.trim() || product.customName
        )}
        confirmText={MESSAGES.CONFIRM_BUTTON_REMOVE}
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setIsConfirmDeleteOpen(false)}
      />
    </>
  );
}
