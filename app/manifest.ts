import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Bheja Fry', short_name: 'Bheja Fry', description: 'AI-powered MCQ generator and mock-test platform', start_url: '/', display: 'standalone', background_color: '#f5efff', theme_color: '#8d72c8', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
}
