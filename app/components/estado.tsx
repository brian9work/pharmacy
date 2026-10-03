import type { ReactNode } from "react";

export type Tono = "neutro" | "exito" | "aviso" | "peligro" | "acento";

const tonos: Record<Tono, string> = {
  neutro: "bg-foreground/[0.07] text-muted",
  exito: "bg-success/10 text-success",
  aviso: "bg-warning/10 text-warning",
  peligro: "bg-danger/10 text-danger",
  acento: "bg-accent/10 text-accent",
};

/** Chip de estado: siempre con texto, nunca solo color. */
export function Estado({ tono = "neutro", children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${tonos[tono]}`}>
      {children}
    </span>
  );
}
