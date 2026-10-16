import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiClientError } from '@/lib/api/client';

describe('ApiClient (MOD-07)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches workspace successfully', async () => {
    const mockData = { activeUpload: null };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockData }),
    } as unknown as Response);

    const res = await apiClient.getWorkspace();
    expect(res).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith('/api/workspace', expect.any(Object));
  });

  it('throws ApiClientError with server message and code on error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'CONFLICT',
          message: 'Este producto ya está en tu tienda.',
        },
      }),
    } as unknown as Response);

    await expect(
      apiClient.createStoreProduct({ productId: 'p-1' })
    ).rejects.toThrow('Este producto ya está en tu tienda.');

    try {
      await apiClient.createStoreProduct({ productId: 'p-1' });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe('CONFLICT');
      expect(apiErr.status).toBe(409);
    }
  });

  it('fetches store products and sends appropriate headers', async () => {
    const mockStore = [
      {
        id: 'sp-1',
        productId: 'p-1',
        catalogDisplayName: 'Arroz',
        customName: 'Arroz Blanco',
        manualPriceBs: null,
        unitsPerBox: 24,
        margins: [0],
        position: 0,
        baseBoxPriceBs: 100,
        unitPriceBs: 4.17,
        salePrices: [{ marginPercent: 0, salePriceBs: 4.17 }],
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockStore }),
    } as unknown as Response);

    const result = await apiClient.getStoreProducts();
    expect(result).toHaveLength(1);
    expect(result[0].customName).toBe('Arroz Blanco');
    expect(global.fetch).toHaveBeenCalledWith('/api/store', expect.objectContaining({
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('calls finalize shopping list with POST and returns invoice', async () => {
    const mockInvoice = {
      id: 'inv-1',
      listId: 'list-1',
      listName: 'Compra del 16/10/2026',
      finalizedAt: '2026-10-16T15:00:00Z',
      priceListDate: '2026-10-16',
      bcvRate: 36.5,
      totalBs: 500,
      hasUsdLines: false,
      lines: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockInvoice }),
    } as unknown as Response);

    const invoice = await apiClient.finalizeShoppingList('list-1');
    expect(invoice.id).toBe('inv-1');
    expect(global.fetch).toHaveBeenCalledWith('/api/lists/list-1/finalize', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('generates proper download URL for a given upload ID', () => {
    const url = apiClient.getDownloadUrl('upload-uuid-123');
    expect(url).toBe('/api/uploads/upload-uuid-123/download');
  });
});
