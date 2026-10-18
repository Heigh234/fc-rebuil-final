import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AppHeader } from '@/components/layout/app-header';
import { TabNavigation } from '@/components/layout/tab-navigation';
import { ActiveUploadBanner } from '@/components/layout/active-upload-banner';
import { CatalogTab } from '@/components/catalog/catalog-tab';
import { StoreTab } from '@/components/store/store-tab';
import { MESSAGES } from '@/lib/i18n/messages';

describe('MOD-S01: Interruptor Global de Fijación en Scroll (Pestañas y Buscador)', () => {
  describe('AppHeader — Interruptor Fijar (REQ-S01)', () => {
    it('renderiza el interruptor con role="switch" y aria-checked="false" por defecto (modo OFF)', () => {
      const html = renderToStaticMarkup(React.createElement(AppHeader));

      expect(html).toContain('sticky top-0 z-30');
      expect(html).toContain('role="switch"');
      expect(html).toContain('aria-checked="false"');
      expect(html).toContain(MESSAGES.STICKY_TOGGLE_LABEL);
      expect(html).toContain(MESSAGES.UPLOAD_PDF_BUTTON);
    });

    it('renderiza el interruptor con aria-checked="true" cuando isStickyNavEnabled es true (modo ON)', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          isStickyNavEnabled: true,
        })
      );

      expect(html).toContain('role="switch"');
      expect(html).toContain('aria-checked="true"');
      expect(html).toContain(MESSAGES.STICKY_TOGGLE_LABEL);
    });
  });

  describe('TabNavigation — Fijación condicional debajo de AppHeader (REQ-S02, REQ-S03)', () => {
    it('no aplica posicionamiento sticky cuando isSticky es false (modo OFF original)', () => {
      const html = renderToStaticMarkup(
        React.createElement(TabNavigation, {
          activeTab: 'store',
          onTabChange: () => {},
          isSticky: false,
        })
      );

      expect(html).not.toContain('sticky top-14');
      expect(html).toContain('Mi tienda');
      expect(html).toContain('Catálogo');
      expect(html).toContain('Compras');
    });

    it('aplica sticky top-14 z-20 cuando isSticky es true (modo ON)', () => {
      const html = renderToStaticMarkup(
        React.createElement(TabNavigation, {
          activeTab: 'catalog',
          onTabChange: () => {},
          isSticky: true,
        })
      );

      expect(html).toContain('sticky top-14 z-20');
      expect(html).toContain('h-14');
    });
  });

  describe('ActiveUploadBanner — Exclusión explícita de posicionamiento sticky (REQ-S04)', () => {
    it('nunca incluye clase sticky en la franja verde claro de carga activa', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveUploadBanner, {
          activeUpload: {
            id: 'upload-1',
            originalFilename: 'lista.pdf',
            priceListDate: '2026-10-17',
            bcvRate: 112.45,
            productCount: 1183,
            createdAt: '2026-10-17T00:00:00Z',
          },
          onClick: () => {},
        })
      );

      expect(html).not.toContain('sticky');
      expect(html).toContain('bg-[#D8F3E3]');
    });
  });

  describe('CatalogTab — Fijación condicional del buscador en top-28 (REQ-S02, REQ-S03)', () => {
    it('no aplica sticky top-28 al buscador cuando isStickySearch es false', () => {
      const html = renderToStaticMarkup(
        React.createElement(CatalogTab, {
          hasActiveUpload: true,
          onUploadClick: () => {},
          onOpenAddToList: () => {},
          isStickySearch: false,
        })
      );

      expect(html).toContain('placeholder="Buscar productos..."');
      expect(html).not.toContain('sticky top-28');
    });

    it('aplica sticky top-28 z-20 al buscador cuando isStickySearch es true', () => {
      const html = renderToStaticMarkup(
        React.createElement(CatalogTab, {
          hasActiveUpload: true,
          onUploadClick: () => {},
          onOpenAddToList: () => {},
          isStickySearch: true,
        })
      );

      expect(html).toContain('placeholder="Buscar productos..."');
      expect(html).toContain('sticky top-28 z-20');
    });
  });

  describe('StoreTab — Render inicial SSR (HALL-07 / REQ-S02)', () => {
    it('renderiza sin errores en SSR estático', () => {
      const html = renderToStaticMarkup(
        React.createElement(StoreTab, {
          onNavigateToCatalog: () => {},
          onOpenAddToList: () => {},
          isStickySearch: false,
        })
      );

      expect(html).toContain('animate-pulse'); // CardSkeleton en estado de carga inicial
    });
  });
});
