import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Personal Planner",
  description: "Victoria's personal dashboard",
  icons: {
    icon: [
      { url: "/img/favicons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/img/favicons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/img/favicons/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/img/favicons/favicon-128x128.png", sizes: "128x128", type: "image/png" },
      { url: "/img/favicons/favicon-196x196.png", sizes: "196x196", type: "image/png" },
    ],
    apple: { url: "/img/favicons/favicon-196x196.png", sizes: "196x196", type: "image/png" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        plusJakarta.variable,
        "font-sans",
        geist.variable,
      )}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
