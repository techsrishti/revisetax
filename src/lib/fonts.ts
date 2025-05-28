// fonts.ts
import localFont from 'next/font/local';

export const inter = localFont({
  src: '../../public/fonts/InterVariable.woff2',
  variable: '--font-inter',
  display: 'swap',
});
export const interVariable = localFont({
  src: '../../public/fonts/InterVariable.woff2',
  variable: '--font-inter-variable',
  display: 'swap',
});


export const grotesk = localFont({
  src: '../../public/fonts/CabinetGrotesk-Variable.woff2',
  variable: '--font-grotesk',
  display: 'swap',
});

