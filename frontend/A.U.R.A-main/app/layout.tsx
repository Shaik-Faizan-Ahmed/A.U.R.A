import type { Metadata } from 'next'
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import ConditionalNav from '@/components/conditional-nav'

const geist = Geist({ subsets: ["latin"], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: '--font-geist-mono' });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: '--font-space' });

export const metadata: Metadata = {
  title: 'A.U.R.A — Assessment & Understanding Report Automation',
  description: 'AI-powered academic integrity scanner: detects AI-generated submissions, plagiarism, and auto-grades with explainability and bias auditing.',
  icons: {
    icon: [
      {
        url: '/veritas.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/veritas.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable} font-sans antialiased`} suppressHydrationWarning>
        <ConditionalNav />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
