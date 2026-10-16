import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bodega FC',
    short_name: 'Bodega FC',
    description: 'Bodega FC - Gestión de Precios, Catálogo y Compras',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#2D6A4F',
    background_color: '#FFFBF5',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
