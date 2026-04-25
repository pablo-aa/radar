import { redirect } from "next/navigation";
import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import OnboardProgress from "@/components/OnboardProgress";
import ClarifyForm from "@/components/ClarifyForm";
import { fetchGitHubProfile } from "@/lib/github";
import { getServerUser } from "@/lib/onboarding";
import { DEFAULT_ONBOARD_STATE } from "@/lib/supabase/types";
import { nextDestinationFor } from "@/lib/routing";

export const dynamic = "force-dynamic";

export default async function ClarifyPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login");

  const { destination, profile } = await nextDestinationFor(user.id);
  if (destination !== "/clarify") redirect(destination);

  const onboard = profile?.onboard_state ?? DEFAULT_ONBOARD_STATE;
  const firstRun = !onboard.report_seen;
  const handle = profile?.github_handle ?? "";
  const ghProfile = handle ? await fetchGitHubProfile(handle) : null;
  const displayName = profile?.display_name ?? handle ?? "you";
  const firstName = displayName.split(" ")[0];

  return (
    <div className="wrap">
      <Appbar
        route="generating"
        userInitials={(profile?.display_name ?? handle ?? "PA")
          .slice(0, 2)
          .toUpperCase()}
        userHandle={handle || "you"}
        userName={displayName}
        userCity={ghProfile?.location ?? ""}
        intakeSubmitted={onboard.intake_done}
        onboardComplete={onboard.report_seen}
      />
      {firstRun && <OnboardProgress step="clarify" />}
      <div className="ana">
        <div>
          <div className="sec-label">
            <span className="n">003</span>
            <span>Clarify · confirm what we think we know</span>
            <span className="bar"></span>
          </div>
          <h1>
            Antes da Anamnesis ler tudo,
            <br />
            algumas confirmacoes
            <span
              style={{
                display: "inline-block",
                width: ".5em",
                height: ".8em",
                background: "var(--accent)",
                marginLeft: ".05em",
                verticalAlign: "-.08em",
                animation: "blink 1.05s steps(1) infinite",
              }}
            ></span>
          </h1>
          <p className="lede">
            {firstName}, com base no seu GitHub e no que voce escreveu, a IA
            preparou de tres a cinco perguntas curtas. Sao confirmacoes
            simples sobre cargo, tempo em cada lugar, e o que voce esta
            fazendo agora. Quanto mais preciso, menos a Anamnesis chuta.
          </p>
          <ClarifyForm firstName={firstName} />
        </div>

        <aside className="ana-confirm">
          <h2>Por que isso?</h2>
          <p className="eye">A diferenca entre achar e saber.</p>
          <div className="prose" style={{ marginTop: 12 }}>
            CV e GitHub mostram o que voce publicou. Nao mostram quanto tempo
            voce ficou em cada lugar, qual era seu papel real, ou se aquele
            repo com 800 stars era um trabalho ou um projeto de fim de
            semana. Sem essas pistas, a Anamnesis preenche os buracos com
            inferencia. Esta etapa fecha esses buracos antes do relatorio ser
            escrito.
          </div>
          <div className="prof" style={{ marginTop: 18 }}>
            <div>
              <span className="k">handle</span>
              <span className="v">{handle || "(not set)"}</span>
            </div>
            {ghProfile?.location && (
              <div>
                <span className="k">based</span>
                <span className="v">{ghProfile.location}</span>
              </div>
            )}
            {ghProfile && (
              <div>
                <span className="k">repos</span>
                <span className="v">
                  {ghProfile.public_repos} public · {ghProfile.followers}{" "}
                  followers
                </span>
              </div>
            )}
            <div>
              <span className="k">cv</span>
              <span className="v">
                {profile?.cv_url ? "uploaded" : "skipped"}
              </span>
            </div>
          </div>
        </aside>
      </div>
      <CornerMeta />
    </div>
  );
}
