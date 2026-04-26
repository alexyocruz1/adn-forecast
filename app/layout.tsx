import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas-neue",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ADN Futbolero | Pronósticos con Inteligencia Artificial",
  description: "Pronósticos diarios de fútbol generados por inteligencia artificial. Análisis de la Premier League, La Liga, Champions League y más.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${bebasNeue.variable} ${dmSans.variable}`}>
      <body className="min-h-screen flex flex-col bg-bg-primary text-text-primary font-body">
        {children}
      </body>
    </html>
  );
}
