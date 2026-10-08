import type { Metadata, Viewport } from "next";

import { fr } from "@/i18n/fr";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: fr.app.name, template: `%s · ${fr.app.name}` },
  description: "Simulation de vie en Afrique de l'Ouest : travaille, mange, sors, progresse. Cotonou, puis Lomé et Abidjan.",
};

export const viewport: Viewport = {
  themeColor: "#c4572e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
