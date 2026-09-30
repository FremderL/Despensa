import "server-only";

import { env } from "@/env";

/**
 * Envío de correo.
 *
 * Sin `SMTP_URL` configurado (desarrollo, o Render antes de conectar un
 * proveedor) el mensaje se imprime en el log del servidor con el enlace
 * completo. Así el flujo de verificación y recuperación se puede probar de
 * principio a fin sin dependencias externas, y nunca se pierde un correo en
 * silencio.
 */

export type Correo = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: import("nodemailer").Transporter | null = null;
let transporterIntentado = false;

async function obtenerTransporter() {
  if (transporterIntentado) return transporter;
  transporterIntentado = true;
  if (!env.SMTP_URL) return null;
  try {
    const nodemailer = await import("nodemailer");
    transporter = nodemailer.createTransport(env.SMTP_URL);
  } catch (err) {
    console.error("[correo] no se pudo inicializar SMTP:", err);
    transporter = null;
  }
  return transporter;
}

export async function enviarCorreo(correo: Correo): Promise<void> {
  const t = await obtenerTransporter();

  if (!t) {
    console.log(
      [
        "",
        "┌───────────────────────── CORREO (modo consola) ─────────────────────────",
        `│ Para:    ${correo.to}`,
        `│ Asunto:  ${correo.subject}`,
        "├──────────────────────────────────────────────────────────────────────────",
        ...correo.text.split("\n").map((l) => `│ ${l}`),
        "└──────────────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }

  try {
    await t.sendMail({ from: env.MAIL_FROM, ...correo });
  } catch (err) {
    // Un fallo de correo no debe revelar al atacante si la cuenta existe,
    // así que se registra en el servidor y la respuesta al usuario no cambia.
    console.error("[correo] fallo al enviar:", err);
  }
}

/* ------------------------------- Plantillas ------------------------------- */

function envoltorio(titulo: string, cuerpo: string, cta?: { texto: string; url: string }) {
  const boton = cta
    ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#0f766e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${cta.texto}</a></p>
       <p style="color:#64748b;font-size:13px;line-height:1.6">Si el botón no funciona, copia esta dirección en tu navegador:<br><span style="color:#0f766e;word-break:break-all">${cta.url}</span></p>`
    : "";

  return `<!doctype html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px">
      <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0f766e;font-weight:700">Despensa</p>
      <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">${titulo}</h1>
      <div style="color:#334155;font-size:15px;line-height:1.7">${cuerpo}</div>
      ${boton}
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:20px">
      Si no esperabas este mensaje puedes ignorarlo sin hacer nada.
    </p>
  </div></body></html>`;
}

export function correoVerificacion(nombre: string, url: string): Omit<Correo, "to"> {
  const text = `Hola ${nombre}:

Confirma tu dirección de correo para activar tu cuenta de Despensa.

${url}

El enlace caduca en 24 horas. Si no creaste esta cuenta, ignora este mensaje.`;

  return {
    subject: "Confirma tu correo · Despensa",
    text,
    html: envoltorio(
      "Confirma tu correo",
      `<p>Hola <strong>${escapar(nombre)}</strong>, ya casi está. Confirma tu dirección para activar la cuenta.</p>
       <p>El enlace caduca en <strong>24 horas</strong>.</p>`,
      { texto: "Confirmar mi correo", url },
    ),
  };
}

export function correoRecuperacion(nombre: string, url: string): Omit<Correo, "to"> {
  const text = `Hola ${nombre}:

Alguien pidió restablecer la contraseña de tu cuenta de Despensa.

${url}

El enlace caduca en 1 hora y sólo puede usarse una vez. Si no fuiste tú, ignora este mensaje: tu contraseña no cambia hasta que se use el enlace.`;

  return {
    subject: "Restablecer tu contraseña · Despensa",
    text,
    html: envoltorio(
      "Restablecer tu contraseña",
      `<p>Hola <strong>${escapar(nombre)}</strong>, recibimos una solicitud para cambiar tu contraseña.</p>
       <p>El enlace caduca en <strong>1 hora</strong> y sólo puede usarse una vez.</p>`,
      { texto: "Elegir contraseña nueva", url },
    ),
  };
}

export function correoIntentoRegistro(url: string): Omit<Correo, "to"> {
  const text = `Alguien intentó crear una cuenta de Despensa con esta dirección, pero ya está registrada.

Si fuiste tú, simplemente inicia sesión. Si olvidaste tu contraseña, puedes restablecerla aquí:

${url}`;

  return {
    subject: "Intento de registro con tu correo · Despensa",
    text,
    html: envoltorio(
      "Esta dirección ya tiene cuenta",
      `<p>Alguien intentó registrarse con tu correo. No hemos creado ninguna cuenta nueva.</p>
       <p>Si fuiste tú, inicia sesión con normalidad. Si no recuerdas la contraseña, puedes restablecerla.</p>`,
      { texto: "Restablecer contraseña", url },
    ),
  };
}

export function correoInvitacion(
  invitante: string,
  despensa: string,
  url: string,
  rol: string,
): Omit<Correo, "to"> {
  const text = `${invitante} te invitó a la despensa "${despensa}" con el rol de ${rol}.

Acepta la invitación aquí:

${url}

El enlace caduca en 7 días y sólo puede usarse una vez.`;

  return {
    subject: `${invitante} te invitó a "${despensa}" · Despensa`,
    text,
    html: envoltorio(
      `Te invitaron a "${escapar(despensa)}"`,
      `<p><strong>${escapar(invitante)}</strong> quiere que gestiones con él la despensa
       <strong>${escapar(despensa)}</strong>, con el rol de <strong>${escapar(rol)}</strong>.</p>
       <p>El enlace caduca en <strong>7 días</strong> y sólo puede usarse una vez.</p>`,
      { texto: "Aceptar invitación", url },
    ),
  };
}

export function correoAvisoPasswordCambiada(nombre: string): Omit<Correo, "to"> {
  const text = `Hola ${nombre}:

La contraseña de tu cuenta de Despensa acaba de cambiar y se cerraron todas las sesiones abiertas.

Si no fuiste tú, restablece la contraseña de inmediato desde ${env.APP_URL}/recuperar`;

  return {
    subject: "Tu contraseña cambió · Despensa",
    text,
    html: envoltorio(
      "Tu contraseña cambió",
      `<p>Hola <strong>${escapar(nombre)}</strong>: la contraseña de tu cuenta acaba de cambiar y cerramos todas las sesiones abiertas.</p>
       <p>Si no fuiste tú, restablécela ahora mismo.</p>`,
      { texto: "Restablecer contraseña", url: `${env.APP_URL}/recuperar` },
    ),
  };
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
