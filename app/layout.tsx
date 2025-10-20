import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "firebaseui/dist/firebaseui.css";
import { AuthGate } from "@/components/auth/auth-gate";
import { AuthProvider } from "@/lib/auth-context";
import { ChatRepositoryProvider } from "@/lib/chat-repository-context";
import { TagProvider } from "@/lib/tag-context";
import { OnlineStatusProvider } from "@/lib/online-status-context";
import { APP_TITLE, APP_DESCRIPTION } from "@/lib/constants";
import { DebugConsole } from "@/components/debug-console";
import { Toaster } from "@/components/ui/toaster";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: APP_TITLE,
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <OnlineStatusProvider>
          <AuthProvider>
            <AuthGate>
              <ChatRepositoryProvider>
                <TagProvider>
                  {children}
                </TagProvider>
              </ChatRepositoryProvider>
            </AuthGate>
          </AuthProvider>
        </OnlineStatusProvider>
        <DebugConsole />
        <Toaster />
      </body>
    </html>
  );
}
