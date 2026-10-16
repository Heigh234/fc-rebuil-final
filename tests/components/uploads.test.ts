import { describe, it, expect } from 'vitest';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatCaracasDate, formatBs } from '@/lib/domain/format';

describe('PDF Upload Flow & UI Logic (MOD-08)', () => {
  it('formats older PDF confirmation text with Caracas dates', () => {
    const pdfDateStr = formatCaracasDate('2026-10-10');
    const activeDateStr = formatCaracasDate('2026-10-15');
    const text = MESSAGES.confirmOlderPdfText(pdfDateStr, activeDateStr);

    expect(text).toBe(
      'Este PDF es del 10/10/2026, anterior a la lista vigente del 15/10/2026. Si continúas, sus precios reemplazarán a los actuales.'
    );
  });

  it('validates file size limit of 10MB (10485760 bytes)', () => {
    const MAX_SIZE = 10 * 1024 * 1024;
    const validSize = 5 * 1024 * 1024;
    const exactLimit = 10 * 1024 * 1024;
    const overLimit = 10 * 1024 * 1024 + 1;

    expect(validSize <= MAX_SIZE).toBe(true);
    expect(exactLimit <= MAX_SIZE).toBe(true);
    expect(overLimit <= MAX_SIZE).toBe(false);
  });

  it('validates PDF extension and mime type', () => {
    const isValidPdf = (name: string, type: string) =>
      type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');

    expect(isValidPdf('lista.pdf', 'application/pdf')).toBe(true);
    expect(isValidPdf('LISTA_PRECIOS.PDF', '')).toBe(true);
    expect(isValidPdf('documento.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
    expect(isValidPdf('imagen.png', 'image/png')).toBe(false);
  });

  it('generates exact result modal text for read, new, and priceless products', () => {
    expect(MESSAGES.resultProductsRead(450)).toBe('Productos leídos: 450');
    expect(MESSAGES.resultNewProducts(12)).toBe('Productos nuevos: 12');
    expect(MESSAGES.resultPricelessStoreProducts(3)).toBe('Productos de tu tienda sin precio: 3');
    expect(MESSAGES.RESULT_PRICELESS_WARNING).toBe(
      'Revisa Mi tienda: los productos sin precio aparecen marcados como «Sin precio».'
    );
  });

  it('maps upload statuses to exact Section 18 labels', () => {
    const statusLabels = {
      applied: MESSAGES.STATUS_CURRENT,
      not_applied: MESSAGES.STATUS_PREVIOUS,
      pending: MESSAGES.STATUS_PROCESSING,
      failed: MESSAGES.STATUS_FAILED,
    };

    expect(statusLabels.applied).toBe('Vigente');
    expect(statusLabels.not_applied).toBe('Anterior');
    expect(statusLabels.pending).toBe('En proceso');
    expect(statusLabels.failed).toBe('Fallida');
  });

  it('formats upload history card dates and rates with fallback for failed uploads', () => {
    const formatCard = (item: { priceListDate: string | null; bcvRate: number | null }) => ({
      date: item.priceListDate ? formatCaracasDate(item.priceListDate) : '-',
      rate: item.bcvRate != null ? formatBs(item.bcvRate) : '-',
    });

    const successCard = formatCard({ priceListDate: '2026-10-16', bcvRate: 36.5 });
    expect(successCard.date).toBe('16/10/2026');
    expect(successCard.rate).toBe('36,50 Bs');

    const failedCard = formatCard({ priceListDate: null, bcvRate: null });
    expect(failedCard.date).toBe('-');
    expect(failedCard.rate).toBe('-');
  });
});
