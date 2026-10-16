import { describe, it, expect } from 'vitest';
import { normalizeSearchText, matchesMultiWordQuery } from '@/lib/domain/search';

describe('search.ts - Búsqueda insensible a tildes/mayúsculas/orden de palabras', () => {
  describe('normalizeSearchText', () => {
    it('convierte a minúsculas y elimina diacríticos y tildes', () => {
      expect(normalizeSearchText('Café con Leche')).toBe('cafe con leche');
      expect(normalizeSearchText('Azúcar Morena')).toBe('azucar morena');
      expect(normalizeSearchText('JABÓN LÍQUIDO')).toBe('jabon liquido');
      expect(normalizeSearchText('Pingüino')).toBe('pinguino');
    });

    it('colapsa espacios múltiples y recorta extremos', () => {
      expect(normalizeSearchText('   harina    pan   ')).toBe('harina pan');
      expect(normalizeSearchText('arroz\t\nblanco')).toBe('arroz blanco');
    });
  });

  describe('matchesMultiWordQuery', () => {
    it('retorna true si la consulta está vacía o contiene solo espacios', () => {
      expect(matchesMultiWordQuery('', ['Harina PAN'])).toBe(true);
      expect(matchesMultiWordQuery('   ', ['Arroz'])).toBe(true);
    });

    it('coincide de forma insensible a mayúsculas y tildes', () => {
      expect(matchesMultiWordQuery('cafe', ['CAFÉ MOLIDO 500G'])).toBe(true);
      expect(matchesMultiWordQuery('azúcar', ['Azucar Blanca 1kg'])).toBe(true);
    });

    it('coincide si todas las palabras están presentes en cualquier orden', () => {
      const candidates = ['Harina de Maíz Blanco', 'Marca PAN'];

      expect(matchesMultiWordQuery('harina pan', candidates)).toBe(true);
      expect(matchesMultiWordQuery('pan harina', candidates)).toBe(true);
      expect(matchesMultiWordQuery('maiz blanco pan harina', candidates)).toBe(true);
    });

    it('retorna false si falta alguna de las palabras de la consulta', () => {
      const candidates = ['Aceite Vegetal 1L', 'Marca Diana'];

      expect(matchesMultiWordQuery('aceite oliva', candidates)).toBe(false);
      expect(matchesMultiWordQuery('harina', candidates)).toBe(false);
    });

    it('maneja valores nulos o indefinidos en los campos candidatos', () => {
      expect(matchesMultiWordQuery('arroz', [null, 'Arroz Mary', undefined])).toBe(true);
      expect(matchesMultiWordQuery('pasta', [null, undefined])).toBe(false);
    });
  });
});
