import type { MetadataRoute } from 'next';

// PWA / atalho no celular. O Next injeta <link rel="manifest"> automaticamente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SB Gestor — Gestão de Decoração e Locação B2B',
    short_name: 'SB Gestor',
    description: 'Gerencie locações, controle seu estoque e integre com decoradoras parceiras.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#17A9CE',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
