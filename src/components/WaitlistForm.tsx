"use client";

// Editorial waitlist form. POSTs to /api/waitlist and renders a success or
// inline error state in place. No nav, no redirect.

import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

type SuccessState = {
  name: string;
  email: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export default function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [handle, setHandle] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [careerMoment, setCareerMoment] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrMsg("");

    let cleanHandle = handle.trim();
    if (cleanHandle.startsWith("@")) cleanHandle = cleanHandle.slice(1);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          github_handle: cleanHandle,
          phone: phone.trim(),
          linkedin_url: linkedinUrl.trim(),
          career_moment: careerMoment.trim(),
        }),
      });
      const data: unknown = await res.json().catch(() => null);

      if (res.status === 200 && isRecord(data) && data.ok === true) {
        setSuccess({ name: name.trim(), email: email.trim() });
        setStatus("success");
        return;
      }

      if (res.status === 409) {
        setErrMsg(`@${cleanHandle} já está na lista. Aguarde seu convite.`);
        setStatus("error");
        return;
      }

      if (res.status === 400 && isRecord(data) && typeof data.error === "string") {
        const map: Record<string, string> = {
          invalid_json: "Não foi possível ler o formulário. Tente de novo.",
          invalid_body: "Não foi possível ler o formulário. Tente de novo.",
          missing_name: "Informe seu nome.",
          name_too_long: "Nome muito longo.",
          missing_email: "Informe seu email.",
          email_too_long: "Email muito longo.",
          invalid_email: "Email parece inválido.",
          missing_github_handle: "Informe seu GitHub handle.",
          invalid_github_handle: "GitHub handle parece inválido.",
          missing_phone: "Informe seu celular.",
          invalid_phone: "Celular inválido.",
          missing_linkedin_url: "Informe seu LinkedIn ou portfólio.",
          invalid_linkedin_url: "Link inválido. Use https.",
          missing_career_moment: "Conte seu momento na carreira.",
          career_moment_too_long: "Momento muito longo. Encurte abaixo de 1000 caracteres.",
        };
        setErrMsg(map[data.error] ?? "Algo deu errado. Tente de novo.");
        setStatus("error");
        return;
      }

      setErrMsg("Erro no servidor. Tente de novo em um minuto.");
      setStatus("error");
    } catch {
      setErrMsg("Erro de rede. Confira sua conexão e tente de novo.");
      setStatus("error");
    }
  };

  if (status === "success" && success) {
    return (
      <div className="waitlist-success">
        <div className="waitlist-success-kicker">§ on the list</div>
        <p className="waitlist-success-body">
          Obrigado {success.name}, você está na lista.
          Avisamos em <strong>{success.email}</strong> quando abrir seu convite.
        </p>
        <p className="waitlist-success-fine">
          Open source, AGPL-3.0. Convite único durante o beta.
        </p>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <form className="waitlist-form" onSubmit={submit} noValidate>
      <label className="waitlist-label">
        <span className="waitlist-label-k">Nome</span>
        <input
          className="field"
          type="text"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="waitlist-label">
        <span className="waitlist-label-k">Email</span>
        <input
          className="field"
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="waitlist-label">
        <span className="waitlist-label-k">Celular</span>
        <input
          className="field"
          type="tel"
          name="phone"
          autoComplete="tel"
          required
          maxLength={30}
          placeholder="+55 11 99999-9999"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="waitlist-label">
        <span className="waitlist-label-k">GitHub handle</span>
        <input
          className="field"
          type="text"
          name="github_handle"
          autoComplete="username"
          required
          placeholder="pabloaa"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="waitlist-label">
        <span className="waitlist-label-k">LinkedIn ou portfólio</span>
        <input
          className="field"
          type="url"
          name="linkedin_url"
          required
          maxLength={300}
          placeholder="https://linkedin.com/in/seu-perfil"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="waitlist-label">
        <span className="waitlist-label-k">Seu momento na carreira</span>
        <textarea
          className="field"
          name="career_moment"
          required
          rows={4}
          maxLength={1000}
          placeholder="Onde você está agora e o que está buscando."
          value={careerMoment}
          onChange={(e) => setCareerMoment(e.target.value)}
          disabled={submitting}
        />
      </label>

      {status === "error" && errMsg && (
        <div className="waitlist-error" role="alert">
          {errMsg}
        </div>
      )}

      <div className="waitlist-actions">
        <button
          className="btn"
          type="submit"
          disabled={submitting}
          style={{
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.55 : 1,
          }}
        >
          <span className="hi">J</span>
          {submitting ? "oining..." : "oin waitlist"}
        </button>
        <span className="waitlist-fine">
          Sem spam. Seu email entra em contato só para convidar.
        </span>
      </div>
    </form>
  );
}
