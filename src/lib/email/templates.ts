import "server-only";

/**
 * Escape HTML-special characters before interpolation. The `toName` value
 * comes from `profile.display_name`, which is user-controlled. Without this,
 * a name like `<script>` or `"><img src=x onerror=...>` would render as
 * executable HTML in some email clients.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface AnamnesisDoneEmail {
  toEmail: string;
  toName: string | null;
  reportUrl: string;
}

export function renderAnamnesisDone(data: AnamnesisDoneEmail): {
  subject: string;
  html: string;
  text: string;
} {
  const greetingText = data.toName ? `Oi, ${data.toName}` : "Oi";
  const greetingHtml = data.toName ? `Oi, ${escapeHtml(data.toName)}` : "Oi";
  const subject = "Sua Anamnesis no Radar está pronta";
  const text = `${greetingText}.

A Anamnesis terminou de ler seu trabalho e compor seu retrato.

Veja agora: ${data.reportUrl}

Radar
radar.pabloaa.com
`;
  const html = `<p>${greetingHtml}.</p>
<p>A Anamnesis terminou de ler seu trabalho e compor seu retrato.</p>
<p><a href="${data.reportUrl}">Veja agora</a></p>
<p style="color:#888;font-size:12px;margin-top:32px">Radar - radar.pabloaa.com</p>`;
  return { subject, html, text };
}

export interface StrategistDoneEmail {
  toEmail: string;
  toName: string | null;
  landingUrl: string;
}

export function renderStrategistDone(data: StrategistDoneEmail): {
  subject: string;
  html: string;
  text: string;
} {
  const greetingText = data.toName ? `Oi, ${data.toName}` : "Oi";
  const greetingHtml = data.toName ? `Oi, ${escapeHtml(data.toName)}` : "Oi";
  const subject = "Tudo pronto. Seu report e seu radar te esperam.";
  const text = `${greetingText}.

Seu report editorial e seu radar de oportunidades estão prontos.

Acesse: ${data.landingUrl}

Radar
radar.pabloaa.com
`;
  const html = `<p>${greetingHtml}.</p>
<p>Seu report editorial e seu radar de oportunidades estão prontos.</p>
<p><a href="${data.landingUrl}">Acesse agora</a></p>
<p style="color:#888;font-size:12px;margin-top:32px">Radar - radar.pabloaa.com</p>`;
  return { subject, html, text };
}

export interface RunErrorEmail {
  toEmail: string;
  toName: string | null;
  step: "anamnesis" | "strategist";
  retryUrl: string;
}

export function renderRunError(data: RunErrorEmail): {
  subject: string;
  html: string;
  text: string;
} {
  const greetingText = data.toName ? `Oi, ${data.toName}` : "Oi";
  const greetingHtml = data.toName ? `Oi, ${escapeHtml(data.toName)}` : "Oi";
  const stepLabel =
    data.step === "anamnesis" ? "Anamnesis" : "Strategist";
  const subject = `Tivemos um problema ao rodar a ${stepLabel}`;
  const text = `${greetingText}.

A ${stepLabel} encontrou um problema e não conseguiu terminar. O sistema já sabe.

Acesse seu radar para tentar novamente: ${data.retryUrl}

Radar
radar.pabloaa.com
`;
  const html = `<p>${greetingHtml}.</p>
<p>A ${stepLabel} encontrou um problema e não conseguiu terminar.</p>
<p><a href="${data.retryUrl}">Acesse seu radar para tentar novamente</a></p>
<p style="color:#888;font-size:12px;margin-top:32px">Radar - radar.pabloaa.com</p>`;
  return { subject, html, text };
}
