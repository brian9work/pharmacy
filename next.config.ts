import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autónomo (.next/standalone): un server.js con solo lo necesario, sin
  // código fuente ni node_modules completos. Lo instala scripts/servidor/instalar.sh.
  output: "standalone",
};

export default nextConfig;
