import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE = "https://horizenvault.xyz";
const DESCRIPTION =
  "Private strategy vaults on Horizen. The trader moves the money but can never take it, and the risk caps are enforced on-chain.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Horizen Vault",
  description: DESCRIPTION,
  // og.png is not committed yet; crawlers that cannot fetch it simply render
  // a text card, so dropping a 1200x630 file at public/og.png upgrades every
  // shared link with no code change.
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Horizen Vault",
    title: "Horizen Vault",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Horizen Vault",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
