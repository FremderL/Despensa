#!/usr/bin/env node
/**
 * Prueba de humo end-to-end contra una instancia en marcha.
 *
 *   npm run dev            # en una terminal
 *   npm run prueba:humo    # en otra
 *
 * Habla HTTP como lo haría un navegador sin JavaScript: aprovecha que Next
 * deja en el HTML los campos de mejora progresiva de cada server action. Eso
 * permite comprobar de verdad los caminos que importan —acceso, aislamiento
 * entre despensas, permisos por rol, invitaciones, CSRF y cuotas— sin
 * arrastrar un navegador headless.
 *
 * Requiere haber ejecutado `npm run db:migrate` y `npm run seed`.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let fallos = 0;
let total = 0;

function check(nombre, cond, extra = "") {
  total++;
  if (cond) {
    console.log(`  \x1b[32m✓\x1b[0m ${nombre}`);
  } else {
    fallos++;
    console.log(`  \x1b[31m✗\x1b[0m ${nombre}${extra ? `  \x1b[90m→ ${extra}\x1b[0m` : ""}`);
  }
  return cond;
}

function seccion(t) {
  console.log(`\n\x1b[1m${t}\x1b[0m`);
}

/* --------------------------- Cliente HTTP mínimo -------------------------- */

/**
 * Cada ejecución simula venir de una IP distinta.
 *
 * Sin esto la propia prueba agotaría la cuota por IP y la siguiente pasada
 * fallaría por un motivo que no es un fallo. De paso comprueba que la
 * aplicación lee de verdad `X-Forwarded-For`, que es lo que le llegará
 * detrás del proxy de Render.
 */
const IP_BASE = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;

class Cliente {
  constructor(nombre, ip = IP_BASE) {
    this.nombre = nombre;
    this.ip = ip;
    this.cookies = new Map();
  }

  #cabeceraCookie() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  #guardarCookies(res) {
    for (const linea of res.headers.getSetCookie?.() ?? []) {
      const [par] = linea.split(";");
      const i = par.indexOf("=");
      const nombre = par.slice(0, i).trim();
      const valor = par.slice(i + 1);
      if (valor === "" || /Max-Age=0/i.test(linea)) this.cookies.delete(nombre);
      else this.cookies.set(nombre, valor);
    }
  }

  async pedir(ruta, opciones = {}, saltos = 0) {
    const cabeceras = {
      "user-agent": "prueba-humo/1.0",
      "x-forwarded-for": this.ip,
      ...(opciones.headers ?? {}),
    };
    const galleta = this.#cabeceraCookie();
    if (galleta) cabeceras.cookie = galleta;

    const res = await fetch(new URL(ruta, BASE), {
      ...opciones,
      headers: cabeceras,
      redirect: "manual",
    });
    this.#guardarCookies(res);

    if (res.status >= 300 && res.status < 400 && saltos < 5) {
      const destino = res.headers.get("location");
      if (destino) return this.pedir(destino, { headers: opciones.headers }, saltos + 1);
    }

    const cuerpo = await res.text();
    // `ruta` es dónde se acabó: las acciones que redirigen indican ahí el
    // recurso recién creado, que es más fiable que adivinarlo del listado.
    return { status: res.status, body: cuerpo, headers: res.headers, ruta };
  }

  get(ruta) {
    return this.pedir(ruta);
  }

  /**
   * Descompone el HTML en formularios y extrae, de cada uno, los campos
   * ocultos con los que Next invoca su server action sin JavaScript.
   */
  static formularios(html) {
    const salida = [];
    for (const m of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)) {
      const interior = m[1];
      const campos = {};
      const nombres = new Set();

      // Se captura la etiqueta entera y luego se leen sus atributos: intentar
      // sacar `name` y `value` con un solo patrón falla cuando el orden varía.
      for (const etiqueta of interior.matchAll(/<input\b[^>]*>/g)) {
        const t = etiqueta[0];
        const bruto = t.match(/\bname="([^"]*)"/)?.[1];
        if (!bruto) continue;
        const nombre = desescapar(bruto);
        nombres.add(nombre);
        if (nombre.startsWith("$ACTION")) {
          campos[nombre] = desescapar(t.match(/\bvalue="([^"]*)"/)?.[1] ?? "");
        }
      }
      for (const c of interior.matchAll(/<(?:select|textarea)[^>]*\bname="([^"]+)"/g)) {
        nombres.add(desescapar(c[1]));
      }

      if (Object.keys(campos).length) salida.push({ campos, nombres });
    }
    return salida;
  }

  /** Elige el formulario que contiene todos los campos indicados. */
  static formularioCon(html, ...requeridos) {
    const f = Cliente.formularios(html).find((x) => requeridos.every((r) => x.nombres.has(r)));
    return f ? f.campos : null;
  }

  /** Envía un formulario de server action. */
  async accion(ruta, campos, { origin = BASE } = {}) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.append(k, v);
    return this.pedir(ruta, { method: "POST", body: fd, headers: { origin } });
  }
}

function desescapar(s) {
  return s
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function entrar(cliente, email, password) {
  const { body } = await cliente.get("/ingresar");
  const campos = Cliente.formularioCon(body, "email", "password");
  if (!campos || !Object.values(campos).some(Boolean)) {
    throw new Error("No se pudo leer el formulario de acceso (¿cambió el HTML de Next?)");
  }
  return cliente.accion("/ingresar", { ...campos, siguiente: "", email, password });
}

/* ---------------------------------- Plan ---------------------------------- */

const CLAVE_DEMO = "despensa-demo-2026";

async function main() {
  console.log(`\nProbando ${BASE}\n${"─".repeat(50)}`);

  /* 1 · Páginas públicas ---------------------------------------------------- */
  seccion("1 · Páginas públicas");
  const anon = new Cliente("anónimo");
  for (const ruta of ["/", "/ingresar", "/registro", "/recuperar"]) {
    const r = await anon.get(ruta);
    check(`GET ${ruta} responde 200`, r.status === 200, `status ${r.status}`);
  }

  /* 2 · Cabeceras de seguridad ---------------------------------------------- */
  seccion("2 · Cabeceras de seguridad");
  const portada = await anon.get("/");
  const csp = portada.headers.get("content-security-policy") ?? "";
  check("envía Content-Security-Policy", csp.length > 0);
  check("CSP bloquea object-src", csp.includes("object-src 'none'"), csp.slice(0, 80));
  check("CSP restringe form-action", csp.includes("form-action 'self'"));
  check("CSP fija base-uri", csp.includes("base-uri 'none'"));
  check("X-Content-Type-Options: nosniff", portada.headers.get("x-content-type-options") === "nosniff");
  check("Referrer-Policy definida", Boolean(portada.headers.get("referrer-policy")));
  check("Permissions-Policy definida", Boolean(portada.headers.get("permissions-policy")));
  check("no anuncia X-Powered-By", !portada.headers.get("x-powered-by"));

  /* 3 · Zona privada sin sesión --------------------------------------------- */
  seccion("3 · Zona privada sin sesión");
  for (const ruta of ["/despensas", "/cuenta"]) {
    const r = await anon.pedir(ruta, {}, 5); // sin seguir redirecciones
    check(`GET ${ruta} redirige al acceso`, r.status === 307 || r.status === 302, `status ${r.status}`);
  }

  /* 4 · Credenciales incorrectas -------------------------------------------- */
  seccion("4 · Acceso con credenciales incorrectas");
  const malo = new Cliente("malo");
  const rMal = await entrar(malo, "ana@ejemplo.com", "no-es-la-clave-correcta");
  check("no entrega cookie de sesión", ![...malo.cookies.keys()].some((k) => k.includes("despensa_sesion")));
  check("mensaje genérico, sin revelar si la cuenta existe", rMal.body.includes("Correo o contraseña incorrectos"));

  const rInex = await entrar(new Cliente("inexistente"), "no-existe-nadie@ejemplo.com", "loquesea12345");
  check(
    "mismo mensaje para una cuenta inexistente",
    rInex.body.includes("Correo o contraseña incorrectos"),
  );

  /* 5 · Acceso correcto ------------------------------------------------------ */
  seccion("5 · Acceso correcto");
  const ana = new Cliente("ana");
  await entrar(ana, "ana@ejemplo.com", CLAVE_DEMO);
  const tieneCookie = [...ana.cookies.keys()].some((k) => k.includes("despensa_sesion"));
  check("entrega cookie de sesión", tieneCookie, [...ana.cookies.keys()].join(","));

  const despensas = await ana.get("/despensas");
  check("ve su despensa", despensas.body.includes("Casa de ejemplo"));

  const hid = despensas.body.match(/\/despensas\/([0-9a-f-]{36})/)?.[1];
  check("se obtiene el id de la despensa", Boolean(hid));
  if (!hid) return;

  /* 6 · Inventario y caducidades -------------------------------------------- */
  seccion("6 · Inventario y caducidades");
  const panel = await ana.get(`/despensas/${hid}`);
  check("el panel carga", panel.status === 200 && panel.body.includes("Atención a estas fechas"));

  const inv = await ana.get(`/despensas/${hid}/inventario`);
  check("el inventario lista artículos", inv.body.includes("Lentejas cocidas"));

  const caducados = await ana.get(`/despensas/${hid}/inventario?estado=caducado`);
  check(
    "el filtro de caducados aísla lo vencido",
    caducados.body.includes("Lentejas cocidas") && !caducados.body.includes(">Arroz<"),
  );

  const busqueda = await ana.get(`/despensas/${hid}/inventario?buscar=champ`);
  check("la búsqueda encuentra por nombre", busqueda.body.includes("Champú"));

  const inyeccion = await ana.get(`/despensas/${hid}/inventario?buscar=${encodeURIComponent("%' OR 1=1 --")}`);
  check(
    "una búsqueda con comodines y comillas no rompe ni lista todo",
    inyeccion.status === 200 && !inyeccion.body.includes("Lentejas cocidas"),
    `status ${inyeccion.status}`,
  );

  /* 7 · Aislamiento entre despensas ----------------------------------------- */
  seccion("7 · Aislamiento entre despensas (IDOR)");
  const ajena = await ana.get("/despensas/00000000-0000-4000-8000-000000000000");
  check("una despensa ajena o inexistente devuelve 404", ajena.status === 404, `status ${ajena.status}`);

  const articuloAjeno = await ana.get(
    `/despensas/${hid}/inventario/00000000-0000-4000-8000-000000000000`,
  );
  check("un artículo inexistente devuelve 404", articuloAjeno.status === 404, `status ${articuloAjeno.status}`);

  /* 8 · CSRF ----------------------------------------------------------------- */
  seccion("8 · Protección CSRF");
  const { body: htmlLogin } = await anon.get("/ingresar");
  const camposLogin = Cliente.formularioCon(htmlLogin, "email", "password");
  const cruzado = await anon.accion(
    "/ingresar",
    { ...camposLogin, siguiente: "", email: "ana@ejemplo.com", password: CLAVE_DEMO },
    { origin: "https://sitio-malicioso.example" },
  );
  check("POST con Origin ajeno se rechaza con 403", cruzado.status === 403, `status ${cruzado.status}`);

  const sinOrigen = await anon.pedir("/ingresar", { method: "POST", body: new FormData() });
  check("POST sin cabecera Origin se rechaza", sinOrigen.status === 403, `status ${sinOrigen.status}`);

  /* 9 · Redirección abierta -------------------------------------------------- */
  seccion("9 · Redirección abierta");
  /**
   * Lo que importa no es que la cadena no aparezca en el HTML (Next serializa
   * la URL en su carga útil igualmente), sino que el campo que gobierna la
   * redirección posterior al acceso no la contenga.
   */
  for (const malicioso of [
    "https://sitio-malicioso.example",
    "//sitio-malicioso.example",
    "/\\sitio-malicioso.example",
    "javascript:alert(1)",
  ]) {
    const r = await anon.get(`/ingresar?siguiente=${encodeURIComponent(malicioso)}`);
    const valor = r.body.match(/name="siguiente" value="([^"]*)"/)?.[1] ?? "";
    check(
      `«${malicioso}» se sanea a una ruta interna`,
      valor === "" || (valor.startsWith("/") && !valor.startsWith("//") && !valor.includes(":")),
      `quedó «${valor}»`,
    );
  }

  const interno = await anon.get("/ingresar?siguiente=%2Fdespensas%2Fabc");
  check(
    "una ruta interna legítima sí se conserva",
    (interno.body.match(/name="siguiente" value="([^"]*)"/)?.[1] ?? "") === "/despensas/abc",
  );

  /* 10 · Permisos por rol ---------------------------------------------------- */
  seccion("10 · Permisos por rol");
  const sofia = new Cliente("sofia");
  await entrar(sofia, "sofia@ejemplo.com", CLAVE_DEMO);
  const ajustesSofia = await sofia.get(`/despensas/${hid}/ajustes`);
  check(
    "un miembro no ve los controles de administración",
    ajustesSofia.status === 200 && ajustesSofia.body.includes("hacen falta permisos de administrador"),
    `status ${ajustesSofia.status}`,
  );
  check(
    "un miembro no puede eliminar la despensa",
    !ajustesSofia.body.includes("Eliminar la despensa"),
  );

  /* 11 · Escrituras: despensa, artículo y consumo --------------------------- */
  seccion("11 · Crear despensa, artículo y consumir");

  const nueva = `Prueba ${Date.now().toString(36)}`;
  const listado = await ana.get("/despensas");
  const fCrear = Cliente.formularioCon(listado.body, "name");
  check("hay formulario para crear despensa", Boolean(fCrear));

  let hid2 = null;
  if (fCrear) {
    const creada = await ana.accion("/despensas", { ...fCrear, name: nueva });
    hid2 = creada.ruta?.match(/\/despensas\/([0-9a-f-]{36})/)?.[1] ?? null;
    check("crear despensa redirige a la despensa nueva", Boolean(hid2), creada.ruta);
    check("y aparece en el listado", (await ana.get("/despensas")).body.includes(nueva));
  }

  if (hid2) {
    const ajustes = await ana.get(`/despensas/${hid2}/ajustes`);
    check(
      "la despensa nueva nace con categorías sembradas",
      ajustes.body.includes("Comida preparada") && ajustes.body.includes("Botiquín"),
    );
    check("y con ubicaciones sembradas", ajustes.body.includes("Alacena"));

    const form = await ana.get(`/despensas/${hid2}/inventario/nuevo`);
    const fArt = Cliente.formularioCon(form.body, "name", "quantity", "expiresAt");
    check("hay formulario de alta de artículo", Boolean(fArt));

    if (fArt) {
      const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      await ana.accion(`/despensas/${hid2}/inventario/nuevo`, {
        ...fArt,
        householdId: hid2,
        name: "Yogur de prueba",
        brand: "",
        barcode: "",
        categoryId: "",
        locationId: "",
        unit: "unidad",
        minQuantity: "2",
        perishable: "true",
        notes: "",
        quantity: "4",
        expiresAt: manana,
        expiryType: "caducidad",
        purchasedAt: "",
        price: "",
      });

      const inv2 = await ana.get(`/despensas/${hid2}/inventario`);
      check("el artículo aparece en el inventario", inv2.body.includes("Yogur de prueba"));
      check("y se marca como urgente por caducar mañana", inv2.body.includes("Caduca mañana"));

      const itemId = inv2.body.match(/\/despensas\/[0-9a-f-]{36}\/inventario\/([0-9a-f-]{36})/)?.[1];
      check("se obtiene el id del artículo", Boolean(itemId));

      if (itemId) {
        const detalle = await ana.get(`/despensas/${hid2}/inventario/${itemId}`);
        check("el detalle muestra la existencia", detalle.body.includes("4 unidades"));

        const fConsumir = Cliente.formularioCon(detalle.body, "batchId", "quantity", "motivo");
        check("hay formulario de consumo", Boolean(fConsumir));

        if (fConsumir) {
          const batchId = detalle.body.match(/name="batchId" value="([0-9a-f-]{36})"/)?.[1];
          const r = await ana.accion(`/despensas/${hid2}/inventario/${itemId}`, {
            ...fConsumir,
            householdId: hid2,
            batchId,
            quantity: "1",
            motivo: "consumo",
          });
          check("consumir descuenta del lote", r.body.includes("Quedan 3"), r.body.slice(0, 120));

          const exceso = await ana.accion(`/despensas/${hid2}/inventario/${itemId}`, {
            ...fConsumir,
            householdId: hid2,
            batchId,
            quantity: "999",
            motivo: "consumo",
          });
          check("no se puede consumir más de lo que hay", exceso.body.includes("Sólo quedan"));
        }
      }
    }

    /* Aislamiento real: Sofía no es miembro de la despensa nueva. */
    const intrusa = await sofia.get(`/despensas/${hid2}`);
    check(
      "quien no es miembro recibe 404 en la despensa nueva",
      intrusa.status === 404,
      `status ${intrusa.status}`,
    );

    const intrusaInv = await sofia.get(`/despensas/${hid2}/inventario`);
    check("tampoco puede leer su inventario", intrusaInv.status === 404, `status ${intrusaInv.status}`);
  }

  /* 11b · Invitaciones -------------------------------------------------------- */
  seccion("11b · Invitaciones");
  const invitacionAjena = await ana.get("/invitacion/token-inventado-que-no-existe");
  check(
    "un token inválido se rechaza sin filtrar nada",
    invitacionAjena.body.includes("no existe") || invitacionAjena.body.includes("no válida"),
  );

  if (hid2) {
    const pagMiembros = await ana.get(`/despensas/${hid2}/miembros`);
    const fInvitar = Cliente.formularioCon(pagMiembros.body, "email", "role", "diasValidez");
    check("hay formulario de invitación", Boolean(fInvitar));

    if (fInvitar) {
      const r = await ana.accion(`/despensas/${hid2}/miembros`, {
        ...fInvitar,
        householdId: hid2,
        email: "",
        role: "member",
        diasValidez: "7",
      });

      const enlace = r.body.match(/\/invitacion\/([A-Za-z0-9_-]{20,})/)?.[1];
      check("se genera un enlace de invitación", Boolean(enlace), r.body.slice(0, 160));

      if (enlace) {
        const vista = await sofia.get(`/invitacion/${enlace}`);
        check("la invitada ve de qué despensa se trata", vista.body.includes(nueva));

        const fAceptar = Cliente.formularioCon(vista.body, "token");
        check("hay formulario para aceptar", Boolean(fAceptar));

        if (fAceptar) {
          await sofia.accion(`/invitacion/${enlace}`, { ...fAceptar, token: enlace });
          const ahoraSi = await sofia.get(`/despensas/${hid2}`);
          check("tras aceptar, ya tiene acceso", ahoraSi.status === 200, `status ${ahoraSi.status}`);

          const reuso = await sofia.get(`/invitacion/${enlace}`);
          check(
            "el enlace no se puede volver a usar",
            reuso.body.includes("ya se usó") || reuso.body.includes("Ya estás dentro"),
          );
        }
      }
    }
  }

  /* 12 · Cuotas de intentos -------------------------------------------------- */
  seccion("12 · Límite de intentos");
  const ipAtacante = `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
  let bloqueado = false;
  let intentos = 0;
  for (let i = 0; i < 14; i++) {
    intentos++;
    const c = new Cliente(`fuerza-${i}`, ipAtacante);
    const r = await entrar(c, `objetivo-${ipAtacante}@ejemplo.com`, `intento-numero-${i}-xx`);
    if (r.body.includes("Demasiados intentos")) {
      bloqueado = true;
      break;
    }
  }
  check(`tras ${intentos} intentos fallidos se corta por cuota`, bloqueado);

  // La cuota es por IP: otra red no debe heredar el bloqueo del atacante.
  const vecino = new Cliente("vecino", `192.0.2.${1 + Math.floor(Math.random() * 250)}`);
  const rVecino = await entrar(vecino, "ana@ejemplo.com", CLAVE_DEMO);
  check(
    "el bloqueo no salpica a otra IP",
    [...vecino.cookies.keys()].some((k) => k.includes("despensa_sesion")),
    rVecino.body.slice(0, 120),
  );

  /* 13 · Borrado con confirmación ------------------------------------------- */
  if (hid2) {
    seccion("13 · Eliminar la despensa de prueba");
    const ajustes2 = await ana.get(`/despensas/${hid2}/ajustes`);
    const fBorrar = Cliente.formularioCon(ajustes2.body, "confirmacion");
    check("hay formulario de borrado con confirmación", Boolean(fBorrar));

    if (fBorrar) {
      const mal = await ana.accion(`/despensas/${hid2}/ajustes`, {
        ...fBorrar,
        householdId: hid2,
        confirmacion: "nombre que no es",
      });
      check("un nombre que no coincide no borra nada", mal.body.includes("no coincide"));
      check("la despensa sigue existiendo", (await ana.get(`/despensas/${hid2}`)).status === 200);

      await ana.accion(`/despensas/${hid2}/ajustes`, {
        ...fBorrar,
        householdId: hid2,
        confirmacion: nueva,
      });
      const tras = await ana.get(`/despensas/${hid2}`);
      check("con el nombre exacto sí se borra", tras.status === 404, `status ${tras.status}`);
    }
  }

  /* Resumen ------------------------------------------------------------------ */
  console.log(`\n${"─".repeat(50)}`);
  if (fallos === 0) {
    console.log(`\x1b[32m✓ ${total} comprobaciones, todas correctas\x1b[0m\n`);
  } else {
    console.log(`\x1b[31m✗ ${fallos} de ${total} comprobaciones fallaron\x1b[0m\n`);
  }
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\n✗ La prueba se interrumpió:", err);
  process.exit(1);
});
