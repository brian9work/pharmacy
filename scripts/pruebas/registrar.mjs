// Permite correr las pruebas de lib/ con node:test, sin dependencias:
// Node 24 ya entiende TypeScript; esto solo resuelve los imports "@/…" y
// los relativos sin extensión, igual que Next.
import { register } from "node:module";

register("./resolver.mjs", import.meta.url);
