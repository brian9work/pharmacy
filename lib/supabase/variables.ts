type Nombre = "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_SERVICE_ROLE_KEY";

// Lectura explícita: Next solo incluye en el navegador las NEXT_PUBLIC_ escritas así.
const valores: Record<Nombre, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

export function variable(nombre: Nombre): string {
  const valor = valores[nombre];
  if (!valor) throw new Error(`Falta la variable ${nombre} en .env`);
  return valor;
}
