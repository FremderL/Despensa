import type { NextConfig } from "next";

/**
 * El proxy de vista previa sirve la app bajo un dominio distinto al del
 * servidor. Next verifica el origen de las server actions comparando `Origin`
 * con `x-forwarded-host`, así que hay que declarar ese dominio como de
 * confianza o toda escritura respondería 403.
 *
 * En producción la lista se reduce a APP_URL.
 */
const origenesConfiables = (() => {
  const lista: string[] = [];
  if (process.env.APP_URL) {
    try {
      lista.push(new URL(process.env.APP_URL).host);
    } catch {
      /* APP_URL mal formada: env.ts ya lo reporta */
    }
  }
  if (process.env.NODE_ENV !== "production") {
    lista.push("localhost:3000", "127.0.0.1:3000", "*.e2b.app");
  }
  return lista;
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Oculta la versión del framework: no hay razón para anunciarla.
  poweredByHeader: false,

  experimental: {
    serverActions: {
      allowedOrigins: origenesConfiables,
      // Suficiente para formularios de texto; recorta la superficie de abuso.
      bodySizeLimit: "1mb",
    },
  },

  // Peticiones de recursos de desarrollo desde el dominio de la vista previa.
  allowedDevOrigins: ["*.e2b.app"],

  /**
   * Estos paquetes no deben pasar por el empaquetador del servidor: `pg` y
   * `@node-rs/argon2` cargan binarios nativos y PGlite carga un WASM.
   */
  serverExternalPackages: ["pg", "@node-rs/argon2", "@electric-sql/pglite", "nodemailer"],

  // El build falla si hay errores de tipos: es una red de seguridad, no ruido.
  typescript: { ignoreBuildErrors: false },

  output: "standalone",
};

export default nextConfig;
