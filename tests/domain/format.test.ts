import { describe, it, expect } from 'vitest';
import {
  formatBs,
  formatLineAmount,
  formatMarginPercent,
  parseLocalizedDecimal,
  formatCaracasDate,
  getCaracasTodayIso,
  getDefaultShoppingListName,
} from '@/lib/domain/format';

describe('format.ts - Formateo venezolano y zona horaria Caracas', () => {
  describe('formatBs', () => {
    it('formatea montos a "X.XXX,XX Bs" con punto de miles y coma decimal', () => {
      expect(formatBs(1234.56)).toBe('1.234,56 Bs');
      expect(formatBs(0)).toBe('0,00 Bs');
      expect(formatBs(1000000)).toBe('1.000.000,00 Bs');
      expect(formatBs(5.5)).toBe('5,50 Bs');
      expect(formatBs(0.05)).toBe('0,05 Bs');
    });

    it('formatea montos negativos con signo menos', () => {
      expect(formatBs(-50.5)).toBe('-50,50 Bs');
      expect(formatBs(-1234.56)).toBe('-1.234,56 Bs');
    });
  });

  describe('formatLineAmount', () => {
    it('formatea con etiqueta USD para líneas en dólares', () => {
      expect(formatLineAmount(1234.56, 'USD')).toBe('1.234,56 USD');
      expect(formatLineAmount(10, 'USD')).toBe('10,00 USD');
    });

    it('formatea con etiqueta Bs para líneas en bolívares', () => {
      expect(formatLineAmount(1234.56, 'VES')).toBe('1.234,56 Bs');
      expect(formatLineAmount(0, 'VES')).toBe('0,00 Bs');
    });
  });

  describe('formatMarginPercent', () => {
    it('formatea enteros con signo %', () => {
      expect(formatMarginPercent(20)).toBe('20%');
      expect(formatMarginPercent(0)).toBe('0%');
      expect(formatMarginPercent(500)).toBe('500%');
    });

    it('formatea decimales con coma en lugar de punto', () => {
      expect(formatMarginPercent(12.5)).toBe('12,5%');
      expect(formatMarginPercent(15.75)).toBe('15,75%');
    });
  });

  describe('parseLocalizedDecimal', () => {
    it('parsea cadenas con coma decimal', () => {
      expect(parseLocalizedDecimal('12,5')).toBe(12.5);
      expect(parseLocalizedDecimal('1234,56')).toBe(1234.56);
    });

    it('parsea cadenas con punto decimal', () => {
      expect(parseLocalizedDecimal('12.5')).toBe(12.5);
      expect(parseLocalizedDecimal('1234.56')).toBe(1234.56);
    });

    it('parsea cadenas con separador de miles y coma decimal venezolana', () => {
      expect(parseLocalizedDecimal('1.234,56')).toBe(1234.56);
      expect(parseLocalizedDecimal('1.000.000,00')).toBe(1000000);
    });

    it('parsea cadenas con formato anglosajón', () => {
      expect(parseLocalizedDecimal('1,234.56')).toBe(1234.56);
    });

    it('retorna null para entradas inválidas o vacías', () => {
      expect(parseLocalizedDecimal('')).toBeNull();
      expect(parseLocalizedDecimal('   ')).toBeNull();
      expect(parseLocalizedDecimal('abc')).toBeNull();
      expect(parseLocalizedDecimal(null)).toBeNull();
      expect(parseLocalizedDecimal(undefined)).toBeNull();
    });
  });

  describe('formatCaracasDate', () => {
    it('formatea strings ISO YYYY-MM-DD directamente a DD/MM/YYYY sin desfase', () => {
      expect(formatCaracasDate('2026-10-16')).toBe('16/10/2026');
      expect(formatCaracasDate('2025-01-05')).toBe('05/01/2025');
    });

    it('calcula la fecha en America/Caracas para timestamps UTC', () => {
      // 02:30 UTC del día 17 son las 22:30 del día 16 en Caracas (UTC-4)
      const d1 = new Date('2026-10-17T02:30:00Z');
      expect(formatCaracasDate(d1)).toBe('16/10/2026');

      // 03:30 UTC del día 17 son las 23:30 del día 16 en Caracas (UTC-4)
      const d2 = new Date('2026-10-17T03:30:00Z');
      expect(formatCaracasDate(d2)).toBe('16/10/2026');

      // 04:00 UTC del día 17 son las 00:00 del día 17 en Caracas (UTC-4)
      const d3 = new Date('2026-10-17T04:00:00Z');
      expect(formatCaracasDate(d3)).toBe('17/10/2026');
    });
  });

  describe('getCaracasTodayIso', () => {
    it('retorna YYYY-MM-DD en hora de Caracas', () => {
      const d = new Date('2026-10-17T02:30:00Z');
      expect(getCaracasTodayIso(d)).toBe('2026-10-16');
    });
  });

  describe('getDefaultShoppingListName', () => {
    it('genera "Compra del DD/MM/YYYY" respetando la zona horaria de Caracas', () => {
      // Criterio de aceptación explícito: 02:30Z del 17/10 debe ser 16/10/2026
      const dateAtNight = new Date('2026-10-17T02:30:00Z');
      expect(getDefaultShoppingListName(dateAtNight)).toBe('Compra del 16/10/2026');

      const nextDayMorning = new Date('2026-10-17T14:00:00Z');
      expect(getDefaultShoppingListName(nextDayMorning)).toBe('Compra del 17/10/2026');
    });
  });
});
