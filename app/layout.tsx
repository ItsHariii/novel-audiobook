import type { Metadata, Viewport } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tome",
  description: "Listen to web novels as an audiobook",
  manifest: "/manifest.webmanifest",
  applicationName: "Tome",
  // Tells iOS to treat the home-screen install as a standalone PWA (own
  // process, own background audio quota) rather than a Safari shortcut.
  // Without this, Safari's bg restrictions apply even after "Add to Home
  // Screen", which is the most common cause of bg playback being killed.
  appleWebApp: {
    capable: true,
    title: "Tome",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
    { media: "(prefers-color-scheme: light)", color: "#faf5e6" },
  ],
};

// Inline script: runs before hydration to apply the user's saved theme (or
// their system preference) so there's no flash of the wrong palette on load.
const themeInitScript = `
try {
  var t = localStorage.getItem('nab:theme');
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
