// fonts.ts
import localFont from 'next/font/local';

export const inter = localFont({
  src: '../public/fonts/InterVariable.woff2',
  variable: '--font-inter',
  display: 'swap',
});

export const grotesk = localFont({
  src: '../public/fonts/GroteskVariable.woff2',
  variable: '--font-grotesk',
  display: 'swap',
});

