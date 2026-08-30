import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastHost } from "@/components/Toast";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flowbook",
  description:
    "Node-based AI workbook — combine text, image, audio and video nodes into pipelines.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
