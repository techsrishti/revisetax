import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import "../styles/theme.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Revise Tax",
  description: "Tax revision and filing platform",
  icons: {
    icon: "logo-Avatar.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
