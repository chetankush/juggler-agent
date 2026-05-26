import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// ── Fonts (variable-font, subset latin) ──────────────────────────────────
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Preload: only the regular and medium cuts; headings via CSS weight
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "AI Sync Copilot",
    template: "%s | AI Sync Copilot",
  },
  description:
    "AI-powered developer execution alignment assistant — turns Discord mentions into tasks, reminds you, and explains them using your repo.",
  robots: { index: false }, // private SaaS — don't index
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never disable zoom — accessibility requirement
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      // suppressHydrationWarning needed because next-themes adds `class` on the
      // client. Without it React complains about the server/client mismatch.
      suppressHydrationWarning
    >
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          {/* Toaster — aria-live="polite", never steals focus, auto-dismiss 4s */}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
