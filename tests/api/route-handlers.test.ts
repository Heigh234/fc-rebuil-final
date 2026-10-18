import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// Top-level mock state (EVID-C7-05)
const { mockState } = vi.hoisted(() => {
  return {
    mockState: {
      pdfUploads: new Map<string, any>(),
      storeProducts: new Map<string, any>(),
      invoices: new Map<string, any>(),
      shoppingLists: [] as any[],
      shoppingListItems: [] as any[],
      workspaceSettings: { active_upload_id: 'upload-valid-1' },
      updateCalls: [] as { table: string; payload: any; filters: Record<string, any> }[],
      orCalls: [] as { table: string; filter: string }[],
    },
  };
});

// Top-level mock for Supabase server client
vi.mock('@/lib/supabase/server', () => {
  return {
    PDF_STORAGE_BUCKET: 'distributor-pdfs',
    createServiceRoleClient: () => ({
      rpc: vi.fn(async (name: string, _params?: any) => {
        if (name === 'expire_stale_pending_uploads') {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }),
      from: (table: string) => {
        let currentFilters: Record<string, any> = {};
        let updatePayload: any = null;

        const builder: any = {
          select: vi.fn(() => builder),
          eq: vi.fn((col: string, val: any) => {
            currentFilters[col] = val;
            return builder;
          }),
          neq: vi.fn(() => builder),
          in: vi.fn(() => builder),
          or: vi.fn((filterStr: string) => {
            mockState.orCalls.push({ table, filter: filterStr });
            return builder;
          }),
          order: vi.fn(() => builder),
          range: vi.fn((from: number, to: number) => {
            let data: any[] = [];
            if (table === 'store_products') {
              data = Array.from(mockState.storeProducts.values()).slice(from, to + 1);
            } else if (table === 'shopping_list_items') {
              data = mockState.shoppingListItems.slice(from, to + 1);
            }
            return {
              data,
              error: null,
              then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve),
            };
          }),
          update: vi.fn((payload: any) => {
            updatePayload = payload;
            return builder;
          }),
          delete: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => {
            if (table === 'pdf_uploads') {
              const item = mockState.pdfUploads.get(currentFilters['id']);
              return { data: item ?? null, error: null };
            }
            if (table === 'workspace_settings') {
              return { data: mockState.workspaceSettings, error: null };
            }
            if (table === 'store_products') {
              return { data: null, error: null };
            }
            if (table === 'invoices') {
              return { data: null, error: null };
            }
            return { data: null, error: null };
          }),
          then: (resolve: any, reject: any) => {
            if (updatePayload !== null) {
              mockState.updateCalls.push({
                table,
                payload: updatePayload,
                filters: { ...currentFilters },
              });
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
            if (table === 'shopping_lists') {
              return Promise.resolve({ data: mockState.shoppingLists, error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };

        return builder;
      },
      storage: {
        from: () => ({
          download: vi.fn(),
        }),
      },
    }),
  };
});

import { POST as confirmPost } from '@/app/api/uploads/[id]/confirm/route';
import { PATCH as storePatch, DELETE as storeDelete } from '@/app/api/store/[id]/route';
import { GET as invoiceGet } from '@/app/api/invoices/[id]/route';
import { GET as listsGet } from '@/app/api/lists/route';
import { MESSAGES } from '@/lib/i18n/messages';

describe('REM-03 / HALL-03: Pruebas Directas de Route Handlers', () => {
  beforeEach(() => {
    mockState.pdfUploads.clear();
    mockState.storeProducts.clear();
    mockState.invoices.clear();
    mockState.shoppingLists = [];
    mockState.shoppingListItems = [];
    mockState.updateCalls = [];
    mockState.orCalls = [];
  });

  describe('POST /api/uploads/[id]/confirm (HALL-01 / CONT-REM-03)', () => {
    it('retorna 404 NOT_FOUND si la carga no existe y no realiza update', async () => {
      const req = new Request('http://localhost/api/uploads/non-existent-id/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'cancel' }),
      });

      const res = await confirmPost(req, {
        params: Promise.resolve({ id: 'non-existent-id' }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error.code).toBe('NOT_FOUND');
      expect(mockState.updateCalls.length).toBe(0);
    });

    it('retorna 409 CONFLICT si la carga ya está "applied" y no realiza update', async () => {
      mockState.pdfUploads.set('upload-applied-1', {
        id: 'upload-applied-1',
        status: 'applied',
        price_list_date: '2026-10-10',
      });

      const req = new Request('http://localhost/api/uploads/upload-applied-1/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'cancel' }),
      });

      const res = await confirmPost(req, {
        params: Promise.resolve({ id: 'upload-applied-1' }),
      });
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error.code).toBe('CONFLICT');
      expect(mockState.updateCalls.length).toBe(0);
    });

    it('cancela exitosamente una carga "pending" garantizando eq("status", "pending")', async () => {
      mockState.pdfUploads.set('upload-pending-1', {
        id: 'upload-pending-1',
        status: 'pending',
        price_list_date: '2026-10-10',
      });

      const req = new Request('http://localhost/api/uploads/upload-pending-1/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'cancel' }),
      });

      const res = await confirmPost(req, {
        params: Promise.resolve({ id: 'upload-pending-1' }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.status).toBe('cancelled');
      expect(mockState.updateCalls.length).toBe(1);
      expect(mockState.updateCalls[0]).toEqual({
        table: 'pdf_uploads',
        payload: { status: 'failed' },
        filters: { id: 'upload-pending-1', status: 'pending' },
      });
    });
  });

  describe('Validación temprana de UUID en rutas dinámicas (HALL-08 / CONT-REM-02)', () => {
    const invalidId = 'id-invalido-123';
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('PATCH /api/store/[id] retorna 404 sin llamar a .or() ante ID no-UUID', async () => {
      const req = new Request(`http://localhost/api/store/${invalidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customName: 'Nuevo Nombre' }),
      });

      const res = await storePatch(req, {
        params: Promise.resolve({ id: invalidId }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error.message).toBe(MESSAGES.PRODUCT_NOT_IN_STORE);
      expect(mockState.orCalls.some((c) => c.table === 'store_products')).toBe(false);
    });

    it('DELETE /api/store/[id] retorna 404 sin llamar a .or() ante ID no-UUID', async () => {
      const req = new Request(`http://localhost/api/store/${invalidId}`, {
        method: 'DELETE',
      });

      const res = await storeDelete(req, {
        params: Promise.resolve({ id: invalidId }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error.message).toBe(MESSAGES.PRODUCT_NOT_IN_STORE);
      expect(mockState.orCalls.some((c) => c.table === 'store_products')).toBe(false);
    });

    it('GET /api/invoices/[id] retorna 404 sin llamar a .or() ante ID no-UUID', async () => {
      const req = new Request(`http://localhost/api/invoices/${invalidId}`);

      const res = await invoiceGet(req, {
        params: Promise.resolve({ id: invalidId }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error.message).toBe('Factura no encontrada.');
      expect(mockState.orCalls.some((c) => c.table === 'invoices')).toBe(false);
    });
  });

  describe('GET /api/lists (HALL-02 / CONT-REM-01)', () => {
    it('retorna arreglo vacío si no existen listas', async () => {
      mockState.shoppingLists = [];
      const res = await listsGet();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toEqual([]);
    });

    it('retorna resúmenes de listas abiertas y finalizadas', async () => {
      mockState.shoppingLists = [
        {
          id: 'list-1',
          name: 'Lista de Compras 1',
          status: 'open',
          created_at: '2026-10-18T00:00:00Z',
          finalized_at: null,
        },
      ];
      mockState.shoppingListItems = [
        {
          id: 'item-1',
          list_id: 'list-1',
          product_id: 'prod-1',
          quantity: 2,
          currency_tag: 'VES',
          captured_box_price_bs: null,
          products: { id: 'prod-1', display_name: 'Harina PAN' },
        },
      ];

      const res = await listsGet();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.length).toBe(1);
      expect(json.data[0].id).toBe('list-1');
      expect(json.data[0].itemCount).toBe(1);
    });
  });
});
