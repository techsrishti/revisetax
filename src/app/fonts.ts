import localFont from 'next/font/local'
import { Inter } from 'next/font/google'


export const cabinetGrotesk = localFont({
  src: [
    {
      path: '../../public/fonts/CabinetGrotesk-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/CabinetGrotesk-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/CabinetGrotesk-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../../public/fonts/CabinetGrotesk-Variable.woff2',
      weight: '400 900',
      style: 'normal',
    },
  ],
  variable: '--font-cabinet-grotesk',
})

export const interLocal = localFont({
  src: [
    {
      path: '../../public/fonts/InterVariable.woff2',
      weight: '400 900',
      style: 'variable',
    },
  ],
  variable: '--font-inter-variable',
})

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})