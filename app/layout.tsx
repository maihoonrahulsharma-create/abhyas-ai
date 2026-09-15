import './globals.css';
export const metadata = { title: 'Bheja Fry', description: 'AI-powered MCQ generator and mock-test platform' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
