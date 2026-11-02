import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"

// Archivo, served from the app itself (width and weight axes).
const archivo = localFont({
  src: "./fonts/archivo-latin-variable.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
})

export const metadata: Metadata = {
  title: "ClipFlow",
  description: "Découper une longue vidéo en clips sous-titrés pour TikTok, Reels et Shorts.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className={archivo.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
