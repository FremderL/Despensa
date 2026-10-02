# Despensa

Inventario doméstico compartido. Registra lo que hay en casa —comida preparada,
no perecederos, cosas del baño, limpieza, botiquín— y avisa **antes** de que algo
caduque. Varias personas gestionan la misma despensa, y sólo se entra por
invitación.

Hecho con Next.js sobre PostgreSQL. Pensado para desplegarse en **Render** con la
base de datos en **Neon**.

---

## Empezar en local

No hace falta instalar PostgreSQL: sin `DATABASE_URL`, la aplicación arranca con
[PGlite](https://pglite.dev), un Postgres embebido que guarda los datos en
`.data/pglite`.

```bash
npm install
npm run db:migrate     # crea las tablas
npm run seed           # datos de ejemplo (opcional, sólo en desarrollo)
npm run dev
```

Abre <http://localhost:3000>.

La semilla deja tres cuentas con la misma contraseña, `despensa-demo-2026`:

| Correo              | Rol           | Para ver…                                      |
| ------------------- | ------------- | ---------------------------------------------- |
| `ana@ejemplo.com`   | Propietario   | Todo, incluidos ajustes y borrado              |
| `luis@ejemplo.com`  | Administrador | Invitaciones y gestión de miembros             |
| `sofia@ejemplo.com` | Miembro       | Qué deja de verse cuando no eres administrador |

La despensa de ejemplo trae 28 artículos con caducidades repartidas a propósito
—uno vencido, uno que caduca hoy, otro mañana— para que el semáforo se vea
funcionando desde el primer momento.

### Comandos

| Comando               | Qué hace                                                   |
| --------------------- | ---------------------------------------------------------- |
| `npm run dev`         | Servidor de desarrollo                                      |
| `npm run build`       | Compilación de producción                                   |
| `npm start`           | Sirve la compilación                                        |
| `npm run db:generate` | Genera una migración SQL tras cambiar el esquema            |
| `npm run db:migrate`  | Aplica las migraciones pendientes                           |
| `npm run db:reset`    | Borra la base local y vuelve a migrar                       |
| `npm run seed`        | Datos de ejemplo                                            |
| `npm run typecheck`   | TypeScript sin emitir                                       |
| `npm run lint`        | ESLint                                                      |
| `npm run prueba:humo` | Prueba end-to-end contra la instancia en marcha (71 checks) |

---

## Cómo está organizado

```
src/
├── app/
│   ├── (auth)/          ingresar · registro · recuperar · restablecer · verificar
│   ├── (app)/           zona con sesión: despensas, inventario, miembros, cuenta
│   ├── actions/         server actions: auth, despensas, miembros, inventario
│   └── invitacion/      canje del enlace de invitación
├── components/          interfaz (los formularios son clientes; el resto, servidor)
├── db/                  esquema Drizzle, conexión, migraciones y semilla
├── lib/                 sesión, permisos, cuotas, auditoría, caducidades, correo
└── proxy.ts             cabeceras de seguridad y verificación de origen
```

### Decisiones que conviene conocer

**Un solo servicio.** UI, API y lógica viven en el mismo proceso de Next. Para una
aplicación de este tamaño, partirla en front y back separados sólo añade un salto
de red, dos despliegues y un CORS que configurar mal.

**Lotes, no cantidades sueltas.** Un artículo («Leche») agrupa varios lotes, y cada
lote tiene su propia fecha. Es lo que permite decir *«caduca el cartón del martes»*
en vez de inventar una fecha única para todas las existencias.

**Fechas civiles, no instantes.** Las caducidades se guardan como `date`, sin hora
ni zona. Con un `timestamp`, un yogur que caduca hoy aparecería como vencido a
media mañana según el huso del servidor.

**Los códigos internos van en inglés, la interfaz en español.** `owner`,
`comida_preparada`, `consumo_preferente`… se guardan estables en la base y se
traducen al pintar. Cambiar un texto de la pantalla nunca obliga a migrar datos.

**Cantidades como `numeric`.** Nada de coma flotante para existencias y precios.
Drizzle las devuelve como cadena y se convierten en el borde de la aplicación.

**Sin dependencias de interfaz.** Los iconos son SVG escritos a mano y la
tipografía es la del sistema. Menos peso, ninguna petición a terceros desde el
navegador de quien usa la app y una CSP más fácil de cerrar.

---

## Seguridad

Era el requisito principal del encargo, así que aquí está el detalle de qué se
hace y por qué.

### Identidad y contraseñas

- **Argon2id** (`memoryCost` 19 MiB, `timeCost` 2, `parallelism` 1, los parámetros
  que recomienda OWASP). La contraseña nunca se guarda ni se registra.
- **Política con criterio, no con símbolos obligatorios**: mínimo 10 caracteres,
  se rechazan las contraseñas frecuentes, las secuencias (`123456`, `qwerty`), las
  repeticiones y cualquier cosa que contenga el nombre o el correo. No se exige
  «una mayúscula y un símbolo», porque eso produce `Password1!` y poco más.
- **Respuesta uniforme al fallar el acceso.** El mismo mensaje y el mismo tiempo
  de respuesta exista o no la cuenta: cuando el correo no está registrado se
  verifica igualmente contra un hash señuelo, para no delatar por latencia qué
  direcciones existen.
- **Bloqueo temporal creciente** tras 10 fallos: 5, 10, 20… minutos, con tope de 4
  horas. Frena la fuerza bruta sin permitir que alguien deje fuera a otra persona
  de forma permanente.

### Sesiones

- Identificadores **opacos y aleatorios de 256 bits**, guardados en base de datos
  como HMAC-SHA256. Se eligen frente a un JWT porque aquí **revocar importa**:
  expulsar a alguien, cambiar la contraseña o cerrar la sesión de un móvil perdido
  tienen efecto inmediato; un JWT firmado seguiría siendo válido.
- Cookie `HttpOnly`, `Secure` y `SameSite`, con prefijo `__Host-` en producción
  (el navegador entonces sólo la acepta con HTTPS, `Path=/` y sin `Domain`, lo que
  impide que un subdominio comprometido plante una sesión).
- Los atributos se ajustan al contexto, porque si no encajan el navegador
  descarta la cookie **en silencio** y la sesión parece perderse en cada clic:
  `Lax` sin `Secure` en `http://localhost`; `None` + `Secure` + `Partitioned`
  cuando la app se sirve tras un proxy HTTPS y se ve empotrada; `Lax` en
  producción sobre su propio dominio. El protocolo se deduce del anfitrión y no
  de `x-forwarded-proto`, que el servidor de desarrollo de Next reescribe con
  el del transporte local.
- Caducidad **absoluta** de 30 días e **inactividad** de 7. Cambiar la contraseña
  cierra todas las demás sesiones, y la pantalla de cuenta permite cerrarlas una a
  una.

### Autorización

- Cuatro roles jerárquicos: propietario, administrador, miembro y sólo lectura.
- **Toda** consulta de una despensa pasa antes por `requireMiembro`, que resuelve
  la pertenencia contra la base de datos. El identificador de la URL lo controla
  quien navega, así que nunca se trata como dato de confianza.
- Quien no es miembro recibe **404, no 403**: un 403 confirmaría que esa despensa
  existe.
- Contra la escalada de privilegios: sólo se gestiona a quien tiene un rol
  estrictamente inferior, y sólo se otorgan roles inferiores al propio. La
  despensa no puede quedarse sin propietario.
- Las categorías y ubicaciones que llegan de un formulario se comprueban contra la
  despensa antes de usarse, aunque el desplegable sólo mostrara las correctas.

### Petición a petición

- **Verificación de origen** en todo método que modifica estado; sin `Origin`
  válido, 403 antes de tocar nada. Es la defensa primaria contra CSRF, con
  `SameSite` como segunda capa.
- **CSP** estricta en producción, con nonce por petición y `strict-dynamic`;
  `object-src`, `base-uri` y `frame-ancestors` cerrados, y `form-action 'self'`
  para que un formulario inyectado no pueda enviar datos a otro dominio.
- `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP y
  HSTS con dos años y `preload`.
- **Cuotas persistidas en PostgreSQL**, no en memoria: Render reinicia procesos en
  cada despliegue y puede correr varias instancias, así que un contador en memoria
  no protegería nada. El incremento es un `INSERT ... ON CONFLICT DO UPDATE`
  atómico, inmune a condiciones de carrera.

### Datos e invitaciones

- **Ningún token se guarda en claro.** Sesiones, invitaciones, verificación de
  correo y restablecimiento se almacenan como HMAC-SHA256 con `AUTH_SECRET`. Si se
  filtrara una copia de la base, los tokens no se pueden reconstruir sin esa clave.
- Las invitaciones son de **un solo uso**, caducan, se pueden revocar y admiten
  atarse a una dirección concreta. Se canjean con un POST explícito tras mostrar
  qué se está aceptando.
- Lo mismo con la verificación de correo: **nunca por GET**. Los filtros
  antimalware de muchos correos corporativos visitan los enlaces antes de
  entregarlos, y con un canje por GET ese robot gastaría el token de un solo uso.
- **Bitácora de seguridad** de accesos, invitaciones, cambios de rol y de
  contraseña, con fecha, red y dispositivo, consultable desde la propia cuenta.
  Sólo se inserta: la aplicación nunca actualiza ni borra filas del registro.
- Toda entrada pasa por **Zod** antes de llegar a la base, y todas las consultas
  van parametrizadas por Drizzle. La búsqueda escapa los comodines de `LIKE`.
- Enviar invitaciones **exige el correo confirmado**, para que nadie use la
  aplicación como trampolín para mandar mensajes en nombre de otra persona.
- Los destinos de redirección se sanean: `?siguiente=` sólo acepta rutas internas,
  o la pantalla de acceso se convertiría en un salto de phishing creíble.

### Lo que esta versión no hace

Conviene decirlo tan claro como lo anterior:

- **No hay segundo factor.** Es el siguiente paso natural (TOTP).
- **`X-Forwarded-For` es falsificable** si la aplicación se expone sin un proxy
  delante. Por eso las cuotas nunca dependen sólo de la IP: los accesos se limitan
  también por cuenta.
- **Sin cifrado a nivel de campo.** Quien tenga acceso a la base ve el inventario.
  Las contraseñas y los tokens sí están protegidos.
- **La bitácora no se exporta** a un sistema externo, así que quien controlara el
  servidor podría manipularla.

La prueba de humo (`npm run prueba:humo`) comprueba en vivo buena parte de lo
anterior: aislamiento entre despensas, CSRF, redirección abierta, permisos por
rol, un solo uso de las invitaciones, el corte por cuota y los atributos con que
se emite la cookie en cada contexto.

---

## Desplegar en Render + Neon

### 1 · Base de datos en Neon

Crea un proyecto en [Neon](https://neon.tech) y copia **las dos** cadenas de
conexión que ofrece, que no son intercambiables:

| Variable                | Cadena de Neon               | Para qué                          |
| ----------------------- | ---------------------------- | --------------------------------- |
| `DATABASE_URL`          | **Pooled** (host `-pooler`)  | La aplicación                     |
| `DATABASE_URL_UNPOOLED` | **Directa** (sin `-pooler`)  | Migraciones, volcados, replicación |

> **Por qué separadas.** La cadena agrupada pasa por PgBouncer en modo
> transacción, que no mantiene el estado de sesión entre sentencias. Ejecutar
> migraciones a través de ella provoca fallos intermitentes y difíciles de leer
> (`prepared statement "s0" already exists`, `SET search_path` que no persiste,
> `SQLSTATE 25006` en solo lectura). La aplicación, en cambio, sí quiere el
> agrupador: Render puede levantar varias instancias y Neon limita las conexiones
> directas.
>
> El script de migración avisa si detecta que le pasaron la cadena agrupada.

### 2 · Servicio web en Render

El repositorio incluye un `render.yaml`, así que puedes crear el servicio como
**Blueprint** apuntando a este repositorio. Si prefieres hacerlo a mano:

- **Environment**: Node
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm run db:migrate && npm start`
- **Health Check Path**: `/`

Las migraciones se aplican al arrancar para que el esquema nunca vaya por detrás
del código recién desplegado.

### 3 · Variables de entorno

```bash
NODE_ENV=production
DATABASE_URL=postgresql://…-pooler.…neon.tech/despensa?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://…neon.tech/despensa?sslmode=require
AUTH_SECRET=<openssl rand -base64 48>
APP_URL=https://tu-servicio.onrender.com
MAIL_FROM="Despensa <no-reply@tudominio.com>"
SMTP_URL=smtps://usuario:clave@smtp.tuproveedor.com:465
```

`src/env.ts` valida todo esto al arrancar: si falta algo crítico, el proceso no
levanta en lugar de funcionar con la seguridad degradada.

Sin `SMTP_URL` la aplicación **no se rompe**: los correos se escriben en el log
del servidor. Sirve para probar, pero en producción nadie podrá recuperar su
contraseña, así que conecta un proveedor.

**Cuando cambies `AUTH_SECRET`** se invalidan todas las sesiones e invitaciones
vigentes, porque con esa clave se derivan sus hashes. Es lo que quieres si
sospechas una filtración.

### 4 · Comprobación posterior

```bash
BASE_URL=https://tu-servicio.onrender.com npm run prueba:humo
```

Las secciones que dependen de los datos de ejemplo fallarán contra una base
vacía; las de cabeceras, CSRF, redirección abierta y cuotas son válidas en
cualquier entorno.

---

## Modelo de datos

13 tablas. Las relaciones borran en cascada desde la despensa, de modo que
eliminarla no deja restos.

| Tabla                              | Contenido                                            |
| ---------------------------------- | ---------------------------------------------------- |
| `users`, `sessions`, `auth_tokens` | Identidad, sesiones revocables y tokens de un uso    |
| `households`, `household_members`  | Despensas y quién pertenece a cada una, con su rol   |
| `invitations`                      | Enlaces de invitación: un uso, caducidad, revocables |
| `categories`, `locations`          | Catálogos propios de cada despensa                   |
| `items`, `item_batches`            | Artículos y sus lotes con fecha                      |
| `stock_movements`                  | Altas, consumos, mermas y ajustes                    |
| `audit_log`, `rate_limits`         | Bitácora de seguridad y cuotas de intentos           |

Para cambiar el esquema: edita `src/db/schema.ts`, ejecuta `npm run db:generate` y
revisa el SQL generado en `drizzle/` antes de aplicarlo.

---

## Siguientes pasos naturales

Lo que se dejó fuera a propósito para tener antes un MVP completo:

- Segundo factor (TOTP) y claves de acceso.
- Lista de la compra exportable a partir de los mínimos, que ya se calculan.
- Lectura de códigos de barras con la cámara (el campo ya existe en el modelo).
- Notificaciones push o por correo de lo que caduca esta semana.
- Estadísticas de consumo y desperdicio a partir de `stock_movements`.
