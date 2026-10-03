import type { Metadata, Viewport } from "next";
import { ScriptEnLinea } from "@/app/components/script-en-linea";
import { marca } from "@/config/marca";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: marca.nombre, template: `%s · ${marca.nombre}` },
  description: marca.descripcion,
  icons: { icon: marca.logo.src },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Aplica el tema guardado antes de pintar, para que no parpadee.
// No lo muevas a un componente de cliente.
const scriptTema = `(function(){try{var t=localStorage.getItem("tema");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <ScriptEnLinea html={scriptTema} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
