import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Instrument_Serif,
  JetBrains_Mono,
  Cormorant_Garamond,
} from "next/font/google";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { TutorCharacterProvider } from "@/components/providers/tutor-character-provider";
import { ClarityIdentifier } from "@/components/providers/clarity-provider";
import { UmamiIdentifier } from "@/components/providers/umami-provider";
import { DevConsoleBridge } from "@/components/providers/dev-console-bridge";
import { NativeBridge } from "@/components/native/native-bridge";
import { Toaster } from "@/components/ui/sonner";
import Script from "next/script";
import "katex/dist/katex.min.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display + accent fonts for the /play onboarding surface.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Athena — SAT Math Prep",
  description:
    "AI-powered SAT Math preparation with adaptive tutoring and structured accountability.",
};

// Lay out at the device's real width on phones (instead of the legacy ~980px
// fallback that scaled the whole page down). This is what activates the mobile
// lesson renderer and any responsive layout below `md`. User zoom is left
// enabled on purpose — pinch-to-zoom is an accessibility requirement.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} ${cormorantGaramond.variable} font-sans antialiased`}
        >
          <ClarityIdentifier />
          <UmamiIdentifier />
          <DevConsoleBridge />
          <NativeBridge />
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              <TutorCharacterProvider>
                {children}
                <Toaster richColors position="bottom-right" />
              </TutorCharacterProvider>
            </QueryProvider>
          </ThemeProvider>
          <Script
            id="microsoft-clarity"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                })(window, document, "clarity", "script", "${process.env.NEXT_PUBLIC_CLARITY_ID}");
              `,
            }}
          />
          {process.env.NEXT_PUBLIC_UMAMI_SRC &&
            process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
              <Script
                id="umami-analytics"
                src={process.env.NEXT_PUBLIC_UMAMI_SRC}
                data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
                strategy="afterInteractive"
              />
            )}
          {/* Umami session replay — separate recorder.js, derived from the
              same origin as the tracker. Records only sessions that start
              after Replay is toggled on for the website in Umami. */}
          {process.env.NEXT_PUBLIC_UMAMI_SRC &&
            process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
              <Script
                id="umami-replay"
                src={new URL(
                  "recorder.js",
                  process.env.NEXT_PUBLIC_UMAMI_SRC,
                ).toString()}
                data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
                data-sample-rate="1.0"
                data-mask-level="moderate"
                data-max-duration="300000"
                strategy="afterInteractive"
              />
            )}
        </body>
      </html>
    </AuthProvider>
  );
}
