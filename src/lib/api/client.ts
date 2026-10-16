import type {
  WorkspaceStateDto,
  UploadHistoryItemDto,
  UploadProcessResponseDto,
  CatalogProductDto,
  ProductPriceHistoryItemDto,
  StoreProductDto,
  ShoppingListSummaryDto,
  ShoppingListDetailDto,
  ShoppingListItemDto,
  InvoiceDto,
  CurrencyTag,
  ApiResponse,
  ApiErrorCode,
} from '@/types/contracts';

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    message: string,
    code: ApiErrorCode,
    status: number,
    fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok || 'error' in json) {
    const errorPayload = 'error' in json ? json.error : undefined;
    const message = errorPayload?.message || 'Error en la petición.';
    const code: ApiErrorCode = errorPayload?.code || (res.status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR');
    throw new ApiClientError(message, code, res.status, errorPayload?.fieldErrors);
  }

  return json.data;
}

export const apiClient = {
  // ===========================================================================
  // Espacio de trabajo (MOD-05)
  // ===========================================================================
  async getWorkspace(): Promise<WorkspaceStateDto> {
    return fetchJson<WorkspaceStateDto>('/api/workspace');
  },

  // ===========================================================================
  // Cargas de PDF (MOD-05)
  // ===========================================================================
  async getUploadHistory(): Promise<UploadHistoryItemDto[]> {
    return fetchJson<UploadHistoryItemDto[]>('/api/uploads');
  },

  async requestUpload(params: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<{ uploadId: string; signedUrl: string; token: string; path: string }> {
    return fetchJson<{ uploadId: string; signedUrl: string; token: string; path: string }>(
      '/api/uploads/request-upload',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  async processUpload(uploadId: string): Promise<UploadProcessResponseDto> {
    return fetchJson<UploadProcessResponseDto>(`/api/uploads/${uploadId}/process`, {
      method: 'POST',
    });
  },

  async confirmUpload(
    uploadId: string,
    decision: 'confirm' | 'cancel'
  ): Promise<{ status: string; uploadId?: string; readCount?: number; newCount?: number; pricelessStoreCount?: number }> {
    return fetchJson<{ status: string; uploadId?: string; readCount?: number; newCount?: number; pricelessStoreCount?: number }>(
      `/api/uploads/${uploadId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ decision }),
      }
    );
  },

  getDownloadUrl(uploadId: string): string {
    return `/api/uploads/${uploadId}/download`;
  },

  // ===========================================================================
  // Catálogo (MOD-05)
  // ===========================================================================
  async getCatalog(): Promise<CatalogProductDto[]> {
    return fetchJson<CatalogProductDto[]>('/api/catalog');
  },

  async getProductPriceHistory(productId: string): Promise<ProductPriceHistoryItemDto[]> {
    return fetchJson<ProductPriceHistoryItemDto[]>(`/api/catalog/${productId}/prices`);
  },

  // ===========================================================================
  // Mi tienda (MOD-06)
  // ===========================================================================
  async getStoreProducts(): Promise<StoreProductDto[]> {
    return fetchJson<StoreProductDto[]>('/api/store');
  },

  async createStoreProduct(params: {
    productId: string;
    customName?: string;
    manualPriceBs?: number | null;
    unitsPerBox?: number;
    margins?: number[];
  }): Promise<StoreProductDto> {
    return fetchJson<StoreProductDto>('/api/store', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async updateStoreProduct(
    id: string,
    params: {
      customName?: string;
      manualPriceBs?: number | null;
      unitsPerBox?: number;
      margins?: number[];
    }
  ): Promise<StoreProductDto> {
    return fetchJson<StoreProductDto>(`/api/store/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  },

  async deleteStoreProduct(id: string): Promise<{ message: string }> {
    return fetchJson<{ message: string }>(`/api/store/${id}`, {
      method: 'DELETE',
    });
  },

  async reorderStoreProducts(orderedIds: string[]): Promise<{ message: string }> {
    return fetchJson<{ message: string }>('/api/store/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    });
  },

  // ===========================================================================
  // Listas de compras (MOD-06)
  // ===========================================================================
  async getShoppingLists(): Promise<ShoppingListSummaryDto[]> {
    return fetchJson<ShoppingListSummaryDto[]>('/api/lists');
  },

  async createShoppingList(params?: { name?: string }): Promise<ShoppingListSummaryDto> {
    return fetchJson<ShoppingListSummaryDto>('/api/lists', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  },

  async getShoppingListDetail(id: string): Promise<ShoppingListDetailDto> {
    return fetchJson<ShoppingListDetailDto>(`/api/lists/${id}`);
  },

  async updateShoppingList(id: string, params: { name: string }): Promise<{ id: string; name: string; status: string }> {
    return fetchJson<{ id: string; name: string; status: string }>(`/api/lists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  },

  async deleteShoppingList(id: string): Promise<{ message: string }> {
    return fetchJson<{ message: string }>(`/api/lists/${id}`, {
      method: 'DELETE',
    });
  },

  async addShoppingListItem(
    listId: string,
    params: { productId: string; quantity?: number; currencyTag?: CurrencyTag }
  ): Promise<ShoppingListItemDto> {
    return fetchJson<ShoppingListItemDto>(`/api/lists/${listId}/items`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async updateShoppingListItem(
    listId: string,
    itemId: string,
    params: { quantity?: number; currencyTag?: CurrencyTag }
  ): Promise<ShoppingListItemDto> {
    return fetchJson<ShoppingListItemDto>(`/api/lists/${listId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  },

  async deleteShoppingListItem(listId: string, itemId: string): Promise<{ message: string }> {
    return fetchJson<{ message: string }>(`/api/lists/${listId}/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  async reorderShoppingListItems(listId: string, orderedIds: string[]): Promise<{ message: string }> {
    return fetchJson<{ message: string }>(`/api/lists/${listId}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    });
  },

  async finalizeShoppingList(listId: string): Promise<InvoiceDto> {
    return fetchJson<InvoiceDto>(`/api/lists/${listId}/finalize`, {
      method: 'POST',
    });
  },

  // ===========================================================================
  // Facturas (MOD-06)
  // ===========================================================================
  async getInvoices(): Promise<InvoiceDto[]> {
    return fetchJson<InvoiceDto[]>('/api/invoices');
  },

  async getInvoiceDetail(id: string): Promise<InvoiceDto> {
    return fetchJson<InvoiceDto>(`/api/invoices/${id}`);
  },
};
