'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { AppHeader } from '@/components/layout/app-header';
import { ActiveUploadBanner } from '@/components/layout/active-upload-banner';
import { TabNavigation, TabKey } from '@/components/layout/tab-navigation';
import { CardSkeleton } from '@/components/shared/card-skeleton';
import { ErrorRetryState } from '@/components/shared/error-retry-state';
import { StoreTab } from '@/components/store/store-tab';
import { CatalogTab } from '@/components/catalog/catalog-tab';
import {
  AddToListSheet,
  AddToListProductInput,
} from '@/components/lists/add-to-list-sheet';
import { ShoppingListsTab } from '@/components/lists/shopping-lists-tab';
import { ShoppingListDetail } from '@/components/lists/shopping-list-detail';
import { InvoiceView } from '@/components/lists/invoice-view';
import {
  PdfUploadController,
  PdfUploadControllerRef,
} from '@/components/uploads/pdf-upload-controller';
import { UploadHistorySheet } from '@/components/uploads/upload-history-sheet';
import { useSilentPolling } from '@/hooks/use-silent-polling';
import { apiClient } from '@/lib/api/client';
import { MESSAGES } from '@/lib/i18n/messages';
import type {
  WorkspaceStateDto,
  CatalogProductDto,
  StoreProductDto,
  InvoiceDto,
} from '@/types/contracts';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('store');
  const [workspace, setWorkspace] = useState<WorkspaceStateDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de interacción para pausar polling silencioso (Sección 23)
  const [isUploadBusy, setIsUploadBusy] = useState(false);
  const [isHistorySheetOpen, setIsHistorySheetOpen] = useState(false);
  const [isStoreSheetOpen, setIsStoreSheetOpen] = useState(false);
  const [isCatalogSheetOpen, setIsCatalogSheetOpen] = useState(false);
  const [isAddToListSheetOpen, setIsAddToListSheetOpen] = useState(false);

  // Producto seleccionado para la hoja "Agregar a una lista"
  const [productToAddToList, setProductToAddToList] =
    useState<AddToListProductInput | null>(null);

  // Navegación dentro de la pestaña "Compras"
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceDto | null>(null);
  const [listsRefreshTrigger, setListsRefreshTrigger] = useState(0);

  // Claves de versión para sincronización reactiva entre pestañas
  const [storeVersion, setStoreVersion] = useState(0);
  const [catalogVersion, setCatalogVersion] = useState(0);

  // Referencia al controlador de carga de PDF
  const uploadControllerRef = useRef<PdfUploadControllerRef>(null);

  const fetchWorkspace = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.getWorkspace();
      setWorkspace(data);
    } catch (err) {
      console.error('[Workspace Error]', err);
      setError(MESSAGES.GENERIC_FETCH_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  // Sincronización silenciosa en segundo plano (Sección 23)
  // Pausada mientras se sube un PDF, está abierta una hoja o se visualiza detalle/factura
  useSilentPolling(fetchWorkspace, {
    intervalMs: 30_000,
    paused:
      isUploadBusy ||
      isHistorySheetOpen ||
      isStoreSheetOpen ||
      isCatalogSheetOpen ||
      isAddToListSheetOpen ||
      selectedListId !== null ||
      viewingInvoice !== null ||
      isLoading,
  });

  // Callback de integración para "Agregar a lista" (disparado desde Mi tienda o Catálogo)
  const handleOpenAddToList = useCallback(
    (product: CatalogProductDto | StoreProductDto) => {
      const productId = 'productId' in product ? product.productId : product.id;
      const name =
        'customName' in product ? product.customName : product.displayName;
      setProductToAddToList({ id: productId, name });
      setIsAddToListSheetOpen(true);
    },
    []
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#FFFBF5] text-[#292524] select-text">
      {/* Controlador de subida de PDF (gestiona selector nativo y modales) */}
      <PdfUploadController
        ref={uploadControllerRef}
        onUploadSuccess={() => {
          fetchWorkspace();
          setCatalogVersion((v) => v + 1);
          setStoreVersion((v) => v + 1);
        }}
        onBusyChange={setIsUploadBusy}
      />

      {/* Hoja inferior de historial de cargas */}
      <UploadHistorySheet
        isOpen={isHistorySheetOpen}
        onClose={() => setIsHistorySheetOpen(false)}
      />

      {/* Hoja inferior "Agregar a una lista" */}
      <AddToListSheet
        isOpen={isAddToListSheetOpen}
        product={productToAddToList}
        onClose={() => {
          setIsAddToListSheetOpen(false);
          setProductToAddToList(null);
        }}
        onAddedToList={() => {
          setListsRefreshTrigger((v) => v + 1);
        }}
      />

      {/* 1. Encabezado verde fijo con botón Cargar PDF */}
      <AppHeader
        onUploadClick={() => {
          uploadControllerRef.current?.openFilePicker();
        }}
      />

      {/* 2. Franja de información de carga activa (al tocarla abre historial de cargas, L710) */}
      <ActiveUploadBanner
        activeUpload={workspace?.activeUpload ?? null}
        onClick={() => {
          setIsHistorySheetOpen(true);
        }}
      />

      {/* 3. Barra de navegación de 3 pestañas */}
      <TabNavigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          // Al cambiar de pestaña, resetear vista interna de compras a la raíz
          if (tab !== 'lists') {
            setSelectedListId(null);
            setViewingInvoice(null);
          }
        }}
      />

      {/* 4. Contenido principal debajo de las pestañas */}
      <div className="flex-1 p-4 max-w-[448px] mx-auto w-full">
        {isLoading ? (
          <div className="pt-2">
            <CardSkeleton count={3} />
          </div>
        ) : error ? (
          <ErrorRetryState onRetry={fetchWorkspace} />
        ) : (
          <div className="flex flex-col gap-4">
            {activeTab === 'store' && (
              <div id="tab-store" role="tabpanel" aria-label="Mi tienda">
                <StoreTab
                  key={`store-${storeVersion}`}
                  onNavigateToCatalog={() => setActiveTab('catalog')}
                  onOpenAddToList={handleOpenAddToList}
                  onSheetOpenChange={setIsStoreSheetOpen}
                  onStoreChanged={() => setCatalogVersion((v) => v + 1)}
                />
              </div>
            )}

            {activeTab === 'catalog' && (
              <div id="tab-catalog" role="tabpanel" aria-label="Catálogo">
                <CatalogTab
                  key={`catalog-${catalogVersion}-${workspace?.activeUpload?.id ?? 'none'}`}
                  hasActiveUpload={Boolean(workspace?.activeUpload)}
                  onUploadClick={() => {
                    uploadControllerRef.current?.openFilePicker();
                  }}
                  onOpenAddToList={handleOpenAddToList}
                  onStoreChanged={() => setStoreVersion((v) => v + 1)}
                  onSheetOpenChange={setIsCatalogSheetOpen}
                />
              </div>
            )}

            {activeTab === 'lists' && (
              <div id="tab-lists" role="tabpanel" aria-label="Compras">
                {viewingInvoice !== null ? (
                  <InvoiceView
                    invoice={viewingInvoice}
                    onBack={() => setViewingInvoice(null)}
                  />
                ) : selectedListId !== null ? (
                  <ShoppingListDetail
                    listId={selectedListId}
                    onBack={() => setSelectedListId(null)}
                    onFinalized={(invoice) => {
                      setViewingInvoice(invoice);
                      setListsRefreshTrigger((v) => v + 1);
                    }}
                    onListDeleted={() => {
                      setSelectedListId(null);
                      setListsRefreshTrigger((v) => v + 1);
                    }}
                  />
                ) : (
                  <ShoppingListsTab
                    refreshTrigger={listsRefreshTrigger}
                    onSelectList={(id) => {
                      setSelectedListId(id);
                      setViewingInvoice(null);
                    }}
                    onSelectFinalizedInvoice={async (listId) => {
                      try {
                        const inv = await apiClient.getInvoiceDetail(listId);
                        setViewingInvoice(inv);
                      } catch (err) {
                        console.error('[Open Invoice Error]', err);
                        toast.error(MESSAGES.GENERIC_FETCH_ERROR);
                      }
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
