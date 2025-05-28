import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import "../styles/theme.css"

export const metadata: Metadata = {
  title: "Revise Tax",
  description: "Tax revision and filing platform",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
