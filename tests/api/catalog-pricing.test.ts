import { describe, it, expect } from 'vitest';

/**
 * Función pura que modela exactamente la selección del "precio anterior"
 * según la Sección 8: L325 de BODEGA_FC_ESPECIFICACION_RECONSTRUCCION.md.
 */
interface CandidateUpload {
  id: string;
  priceListDate: string;
  createdAt: string;
  status: 'applied' | 'not_applied' | 'pending' | 'failed';
}

interface PriceRecord {
  productId: string;
  uploadId: string;
  boxPriceBs: number;
}

export function computePreviousPriceBs(
  productId: string,
  activeUpload: { id: string; priceListDate: string },
  uploads: CandidateUpload[],
  prices: PriceRecord[]
): number | null {
  // 1. Filtrar cargas candidatas:
  // - Distintas de la activa
  // - Estado 'applied' o 'not_applied'
  // - Fecha de lista <= fecha de lista activa
  const eligibleUploads = uploads.filter(
    (u) =>
      u.id !== activeUpload.id &&
      (u.status === 'applied' || u.status === 'not_applied') &&
      u.priceListDate <= activeUpload.priceListDate
  );

  // 2. Ordenar por fecha de lista DESC, luego created_at DESC (subida más reciente)
  eligibleUploads.sort((a, b) => {
    const dateComp = b.priceListDate.localeCompare(a.priceListDate);
    if (dateComp !== 0) return dateComp;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (eligibleUploads.length === 0) {
    return null;
  }

  // 3. Crear mapa de ranking de prioridad (0 = máxima prioridad)
  const rankMap = new Map<string, number>();
  eligibleUploads.forEach((u, idx) => rankMap.set(u.id, idx));

  // 4. Buscar precios del producto en las cargas candidatas
  const productPrices = prices.filter(
    (p) => p.productId === productId && rankMap.has(p.uploadId)
  );

  if (productPrices.length === 0) {
    return null;
  }

  // 5. Seleccionar el precio de la carga con menor rank
  productPrices.sort((a, b) => rankMap.get(a.uploadId)! - rankMap.get(b.uploadId)!);

  return productPrices[0].boxPriceBs;
}

describe('Catalog Previous Price calculation (Sección 8: L325)', () => {
  const activeUpload = {
    id: 'u-active',
    priceListDate: '2026-10-15',
  };

  it('selects price from the most recent candidate upload by price_list_date', () => {
    const uploads: CandidateUpload[] = [
      { id: 'u-1', priceListDate: '2026-10-01', createdAt: '2026-10-01T10:00:00Z', status: 'not_applied' },
      { id: 'u-2', priceListDate: '2026-10-10', createdAt: '2026-10-10T10:00:00Z', status: 'not_applied' },
    ];
    const prices: PriceRecord[] = [
      { productId: 'p-1', uploadId: 'u-1', boxPriceBs: 100 },
      { productId: 'p-1', uploadId: 'u-2', boxPriceBs: 120 },
    ];

    const prevPrice = computePreviousPriceBs('p-1', activeUpload, uploads, prices);
    expect(prevPrice).toBe(120);
  });

  it('tiebreaks by created_at DESC when two uploads have identical price_list_date', () => {
    const uploads: CandidateUpload[] = [
      { id: 'u-older-upload', priceListDate: '2026-10-10', createdAt: '2026-10-10T08:00:00Z', status: 'not_applied' },
      { id: 'u-newer-upload', priceListDate: '2026-10-10', createdAt: '2026-10-10T14:00:00Z', status: 'not_applied' },
    ];
    const prices: PriceRecord[] = [
      { productId: 'p-1', uploadId: 'u-older-upload', boxPriceBs: 110 },
      { productId: 'p-1', uploadId: 'u-newer-upload', boxPriceBs: 115 },
    ];

    const prevPrice = computePreviousPriceBs('p-1', activeUpload, uploads, prices);
    expect(prevPrice).toBe(115);
  });

  it('ignores uploads with price_list_date later than active upload', () => {
    const uploads: CandidateUpload[] = [
      { id: 'u-future', priceListDate: '2026-10-20', createdAt: '2026-10-20T10:00:00Z', status: 'not_applied' },
      { id: 'u-past', priceListDate: '2026-10-05', createdAt: '2026-10-05T10:00:00Z', status: 'not_applied' },
    ];
    const prices: PriceRecord[] = [
      { productId: 'p-1', uploadId: 'u-future', boxPriceBs: 200 },
      { productId: 'p-1', uploadId: 'u-past', boxPriceBs: 90 },
    ];

    const prevPrice = computePreviousPriceBs('p-1', activeUpload, uploads, prices);
    expect(prevPrice).toBe(90);
  });

  it('ignores failed and pending uploads', () => {
    const uploads: CandidateUpload[] = [
      { id: 'u-failed', priceListDate: '2026-10-12', createdAt: '2026-10-12T10:00:00Z', status: 'failed' },
      { id: 'u-pending', priceListDate: '2026-10-12', createdAt: '2026-10-12T10:00:00Z', status: 'pending' },
      { id: 'u-valid', priceListDate: '2026-10-08', createdAt: '2026-10-08T10:00:00Z', status: 'not_applied' },
    ];
    const prices: PriceRecord[] = [
      { productId: 'p-1', uploadId: 'u-failed', boxPriceBs: 300 },
      { productId: 'p-1', uploadId: 'u-pending', boxPriceBs: 300 },
      { productId: 'p-1', uploadId: 'u-valid', boxPriceBs: 85 },
    ];

    const prevPrice = computePreviousPriceBs('p-1', activeUpload, uploads, prices);
    expect(prevPrice).toBe(85);
  });

  it('returns null if product did not appear in any eligible previous upload', () => {
    const uploads: CandidateUpload[] = [
      { id: 'u-1', priceListDate: '2026-10-05', createdAt: '2026-10-05T10:00:00Z', status: 'not_applied' },
    ];
    const prices: PriceRecord[] = [
      { productId: 'p-other', uploadId: 'u-1', boxPriceBs: 50 },
    ];

    const prevPrice = computePreviousPriceBs('p-1', activeUpload, uploads, prices);
    expect(prevPrice).toBeNull();
  });

  it('excludes active upload from being its own previous price', () => {
    const uploads: CandidateUpload[] = [
      { id: 'u-active', priceListDate: '2026-10-15', createdAt: '2026-10-15T10:00:00Z', status: 'applied' },
    ];
    const prices: PriceRecord[] = [
      { productId: 'p-1', uploadId: 'u-active', boxPriceBs: 150 },
    ];

    const prevPrice = computePreviousPriceBs('p-1', activeUpload, uploads, prices);
    expect(prevPrice).toBeNull();
  });
});
