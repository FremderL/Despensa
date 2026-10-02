import { NextResponse, type NextRequest } from "next/server";

/**
 * Capa de seguridad previa a todo. Se ejecuta antes que cualquier página o
 * acción de servidor. (En Next 16 este fichero se llama `proxy.ts`; es lo que
 * antes era `middleware.ts`.)
 *
 * Hace tres cosas:
 *   1. Verificar el origen de toda petición que modifica estado (anti-CSRF).
 *   2. Poner las cabeceras de seguridad, con CSP basada en nonce en producción.
 *   3. Un desvío barato al acceso cuando no hay cookie de sesión (sólo UX; la
 *      comprobación real la hace el servidor contra la base de datos).
 *
 * Nota deliberada: aquí NO se consulta la base de datos. Este código corre en
 * cada petición y antes que nada; meter una consulta lo convertiría en un
 * cuello de botella, y una sesión "validada" aquí puede quedarse obsoleta un
 * segundo después. La autorización real vive en `requireMiembro`.
 */

const ES_PROD = process.env.NODE_ENV === "production";
const PERMITE_IFRAME = !ES_PROD || process.env.ALLOW_IFRAME_EMBEDDING === "true";

const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Rutas que exigen sesión. */
const RUTAS_PRIVADAS = [/^\/despensas(\/|$)/, /^\/cuenta(\/|$)/];
/** Rutas de autenticación: si ya hay sesión, sobran. */
const RUTAS_PUBLICAS_AUTH = [/^\/ingresar$/, /^\/registro$/];

const COOKIES_SESION = ["__Host-despensa_sesion", "despensa_sesion"];

function tieneCookieSesion(req: NextRequest): boolean {
  return COOKIES_SESION.some((n) => Boolean(req.cookies.get(n)?.value));
}

/**
 * ¿El `Origin` de la petición es este mismo sitio?
 *
 * Es la defensa central contra CSRF: un formulario alojado en otro dominio
 * llegará con un Origin distinto y se rechaza antes de tocar nada. Las cookies
 * `SameSite` son la segunda capa, no la única.
 */
function origenValido(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  // Los navegadores actuales mandan Origin en todo POST. Si falta, no es un
  // navegador haciendo un envío legítimo de formulario.
  if (!origin) return false;

  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }

  const propios = new Set(
    [
      req.headers.get("x-forwarded-host"),
      req.headers.get("host"),
      process.env.APP_URL ? safeHost(process.env.APP_URL) : null,
    ].filter(Boolean) as string[],
  );

  if (propios.has(host)) return true;

  // Fuera de producción la app se sirve tras el proxy de vista previa, que
  // puede reescribir Host. Se acepta ese dominio sólo en desarrollo.
  if (!ES_PROD && /\.e2b\.app$/.test(host)) return true;

  return false;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function construirCsp(nonce: string): string {
  const directivas: string[][] = [
    ["default-src", "'self'"],
    ["base-uri", "'none'"], // impide secuestrar rutas relativas con <base>
    ["object-src", "'none'"], // nada de Flash/applets
    ["form-action", "'self'"], // un formulario inyectado no puede exfiltrar a otro dominio
    ["frame-src", "'none'"],
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'", "data:"],
    // Tailwind y Next inyectan estilos en línea; es el compromiso habitual y
    // de riesgo bajo comparado con permitir scripts en línea.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["manifest-src", "'self'"],
  ];

  directivas.push(["frame-ancestors", PERMITE_IFRAME ? "*" : "'none'"]);

  if (ES_PROD) {
    // `strict-dynamic` permite que los scripts con nonce carguen sus propios
    // chunks, sin tener que listar rutas. Un script inyectado no tiene nonce
    // y el navegador lo bloquea.
    directivas.push(["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    directivas.push(["connect-src", "'self'"]);
    directivas.push(["upgrade-insecure-requests"]);
  } else {
    // El recargado en caliente de Next necesita eval y websockets.
    directivas.push(["script-src", "'self'", "'unsafe-eval'", "'unsafe-inline'"]);
    directivas.push(["connect-src", "'self'", "ws:", "wss:"]);
  }

  return directivas.map((d) => d.join(" ")).join("; ");
}

function aplicarCabeceras(res: NextResponse, nonce: string): NextResponse {
  res.headers.set("Content-Security-Policy", construirCsp(nonce));
  // Sin sniffing: un .txt subido no se ejecutará como script.
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  if (!PERMITE_IFRAME) res.headers.set("X-Frame-Options", "DENY");

  if (ES_PROD) {
    // HSTS: dos años, subdominios incluidos. Render ya sirve por HTTPS.
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return res;
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = crypto.randomUUID().replaceAll("-", "");

  /* 1 · Anti-CSRF ---------------------------------------------------------- */
  if (!METODOS_SEGUROS.has(req.method) && !origenValido(req)) {
    return aplicarCabeceras(
      new NextResponse("Origen no permitido para esta petición.", {
        status: 403,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
      nonce,
    );
  }

  /* 2 · Desvíos por sesión (sólo comodidad) -------------------------------- */
  const conCookie = tieneCookieSesion(req);

  /**
   * El desvío sólo se aplica a navegaciones, nunca a una escritura.
   *
   * Si una server action se encuentra sin cookie, es mejor dejarla correr: se
   * encontrará con la sesión caducada y devolverá un mensaje dentro del
   * formulario. Redirigir aquí convertiría ese caso en un salto de página que
   * la persona vive como "el botón falló", perdiendo lo que acababa de
   * escribir.
   */
  const esNavegacion = METODOS_SEGUROS.has(req.method);

  if (esNavegacion && !conCookie && RUTAS_PRIVADAS.some((r) => r.test(pathname))) {
    const url = req.nextUrl.clone();
    url.pathname = "/ingresar";
    url.search = "";
    url.searchParams.set("siguiente", pathname + (req.nextUrl.search || ""));
    return aplicarCabeceras(NextResponse.redirect(url), nonce);
  }

  if (esNavegacion && conCookie && RUTAS_PUBLICAS_AUTH.some((r) => r.test(pathname))) {
    const url = req.nextUrl.clone();
    url.pathname = "/despensas";
    url.search = "";
    return aplicarCabeceras(NextResponse.redirect(url), nonce);
  }

  /* 3 · Cabeceras ---------------------------------------------------------- */
  // Next lee el nonce de la CSP en las cabeceras de la petición y lo aplica
  // automáticamente a sus propios <script>.
  const cabeceras = new Headers(req.headers);
  cabeceras.set("x-nonce", nonce);
  cabeceras.set("Content-Security-Policy", construirCsp(nonce));

  return aplicarCabeceras(NextResponse.next({ request: { headers: cabeceras } }), nonce);
}

export const config = {
  matcher: [
    /**
     * Todo salvo los estáticos de Next y los ficheros con extensión. Las
     * peticiones de las server actions sí pasan por aquí: es justo donde se
     * necesita la verificación de origen.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|txt|xml)$).*)",
  ],
};
