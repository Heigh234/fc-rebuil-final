/**
 * Contratos Compartidos - Bodega FC
 *
 * CONT-01: Tipos de Dominio y DTOs de Interfaz
 * CONT-02: Contrato de Errores HTTP y Categorías de Respuesta
 * CONT-03: Contrato del Parser de PDF Adaptado
 */

// =============================================================================
// CONT-01 — Tipos de Dominio y DTOs de Interfaz
// =============================================================================

export type UploadStatus = 'pending' | 'applied' | 'not_applied' | 'failed';
export type ShoppingListStatus = 'open' | 'finalized';
export type CurrencyTag = 'VES' | 'USD';

export interface ActiveUploadSummaryDto {
  id: string;
  originalFilename: string;
  priceListDate: string; // Formato ISO YYYY-MM-DD
  bcvRate: number;       // 2 decimales, > 0
  productCount: number;
  createdAt: string;
}

export interface WorkspaceStateDto {
  activeUpload: ActiveUploadSummaryDto | null;
}

export interface UploadHistoryItemDto {
  id: string;
  originalFilename: string;
  priceListDate: string | null; // null si falló antes de leer el PDF
  bcvRate: number | null;       // null si falló antes de leer el PDF
  productCount: number;
  status: UploadStatus;
  createdAt: string;
}

export type UploadProcessResponseDto =
  | {
      status: 'applied';
      uploadId: string;
      readCount: number;
      newCount: number;
      pricelessStoreCount: number;
    }
  | {
      status: 'requires_confirmation';
      uploadId: string;
      pdfDate: string;    // YYYY-MM-DD
      activeDate: string; // YYYY-MM-DD
    };

export interface CatalogProductDto {
  id: string;
  sourceName: string;
  displayName: string;
  currentPriceBs: number;
  previousPriceBs: number | null;
  priceListDate: string; // YYYY-MM-DD
  inStore: boolean;
}

export interface ProductPriceHistoryItemDto {
  uploadId: string;
  priceListDate: string; // YYYY-MM-DD
  boxPriceBs: number;
  isCurrent: boolean;
}

export interface SalePricePreviewDto {
  marginPercent: number;
  salePriceBs: number;
}

export interface StoreProductDto {
  id: string;
  productId: string;
  catalogDisplayName: string;
  customName: string;
  manualPriceBs: number | null;
  unitsPerBox: number;
  margins: number[];
  position: number;
  baseBoxPriceBs: number | null; // null === "Sin precio"
  unitPriceBs: number | null;
  salePrices: SalePricePreviewDto[];
}

export interface ShoppingListSummaryDto {
  id: string;
  name: string;
  status: ShoppingListStatus;
  createdAt: string;
  finalizedAt: string | null;
  itemCount: number;
  totalBs: number;            // Suma únicamente líneas VES con precio
  usdItemCount: number;       // Líneas con etiqueta USD (excluidas del total)
  pricelessItemCount: number; // Solo > 0 en listas abiertas
}

export interface ShoppingListItemDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  currencyTag: CurrencyTag;
  boxPriceBs: number | null; // null === "Sin precio" (solo posible en lista abierta)
  lineTotalBs: number | null;
  position: number;
}

export interface InvoiceLineDto {
  id: string;
  productName: string;
  quantity: number;
  boxPriceBs: number;
  currencyTag: CurrencyTag;
  lineTotalBs: number;
  position: number;
}

export interface InvoiceDto {
  id: string;
  listId: string;
  listName: string;
  finalizedAt: string;
  priceListDate: string; // YYYY-MM-DD
  bcvRate: number;
  totalBs: number;       // Suma únicamente líneas VES
  hasUsdLines: boolean;
  lines: InvoiceLineDto[]; // Ordenadas alfabéticamente por productName
}

export interface ShoppingListDetailDto {
  id: string;
  name: string;
  status: ShoppingListStatus;
  createdAt: string;
  finalizedAt: string | null;
  capturedBcvRate: number | null;
  capturedPriceListDate: string | null;
  totalBs: number;
  usdItemCount: number;
  pricelessItemCount: number;
  items: ShoppingListItemDto[];
  invoice: InvoiceDto | null; // Presente cuando status === 'finalized'
}

// =============================================================================
// CONT-02 — Contrato de Errores HTTP y Categorías de Respuesta
// =============================================================================

export type ApiErrorCode =
  | 'INVALID_DATA'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'SERVER_ERROR';

export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export interface ApiResponseSuccess<T> {
  data: T;
}

export interface ApiResponseError {
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseError;

// =============================================================================
// CONT-03 — Contrato del Parser de PDF Adaptado
// =============================================================================

export interface NormalizedCatalogProductInput {
  pdfName: string;     // Nombre exacto en línea del PDF (espacios colapsados)
  sourceName: string;  // Minúsculas, sin tildes, espacios simples (identidad única)
  displayName: string; // Title Case conservando tildes, sin empaque redundante
  boxPriceBs: number;  // Número > 0 con 2 decimales
}

export interface DistributorPdfParseSuccess {
  ok: true;
  priceListDate: string; // YYYY-MM-DD validado en calendario y <= hoy + 1 día en America/Caracas
  bcvRate: number;       // > 0, 2 decimales
  products: NormalizedCatalogProductInput[];
  pages: number | null;
}

export interface DistributorPdfParseFailure {
  ok: false;
  reason: 'MISSING_DATE' | 'MISSING_RATE' | 'NO_PRODUCTS';
  userMessage:
    | 'No se encontró la fecha de la lista de precios en el PDF.'
    | 'No se encontró la tasa BCV en el PDF.'
    | 'No se pudieron extraer productos del PDF.';
  technicalDetail: string;
}

export type DistributorPdfParseResult =
  | DistributorPdfParseSuccess
  | DistributorPdfParseFailure;
