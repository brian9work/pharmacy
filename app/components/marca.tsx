import Image from "next/image";
import { marca } from "@/config/marca";

/** Logo y nombre del sistema, tal como están en config/marca.ts. */
export function Marca({ tamano = "chico" }: { tamano?: "chico" | "grande" }) {
  const grande = tamano === "grande";
  return (
    <span className={`flex items-center ${grande ? "flex-col gap-4 text-center" : "gap-3"}`}>
      <Image
        src={marca.logo.src}
        width={marca.logo.ancho}
        height={marca.logo.alto}
        alt=""
        className={`${grande ? "size-16" : "size-8"} shrink-0 object-contain ${marca.logo.invertirEnOscuro ? "dark:invert" : ""}`}
      />
      <span className={grande ? "text-3xl font-semibold tracking-tight" : "text-[17px] font-semibold tracking-tight"}>
        {grande ? marca.nombre : marca.nombreCorto}
      </span>
    </span>
  );
}
