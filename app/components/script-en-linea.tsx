/**
 * Script que corre mientras el navegador lee el HTML, antes de pintar.
 * En el cliente queda como text/plain para que React no avise ni lo repita.
 */
export function ScriptEnLinea({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
