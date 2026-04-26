import Link from "next/link";
import { Fragment } from "react";
import AppbarLoggedIn from "@/components/AppbarLoggedIn";
import RadarDish from "@/components/RadarDish";
import WaitlistForm from "@/components/WaitlistForm";
import { getProfile, getServerUser } from "@/lib/onboarding";

export default async function LandingPage() {
  const { user } = await getServerUser();

  let signedInTopbar: React.ReactNode = <Topbar />;
  let closeBlock: React.ReactNode = <WaitlistCloseBlock />;
  let heroCta: React.ReactNode = (
    <>
      <a href="#waitlist" className="btn">
        <span className="hi">J</span>oin waitlist
      </a>
      <span className="cta-aside">open source · invite-only beta</span>
    </>
  );

  if (user) {
    const profile = await getProfile(user.id);
    const handle = profile?.github_handle ?? "you";
    const initials = (profile?.display_name ?? handle).slice(0, 2).toUpperCase();
    signedInTopbar = (
      <AppbarLoggedIn userInitials={initials} userHandle={handle} />
    );
    closeBlock = <SignedInCloseBlock handle={handle} />;
    heroCta = (
      <>
        <Link href="/radar" className="btn">
          <span className="hi">G</span>o to radar
        </Link>
        <span className="cta-aside">signed in as @{handle}</span>
      </>
    );
  }

  return (
    <>
      <CornerMeta />
      <div className="wrap">
        {signedInTopbar}
        <Hero heroCta={heroCta} />
      </div>
      <div className="wrap">
        <Pain />
      </div>
      <div className="wrap">
        <Specimen />
      </div>
      <div className="wrap">
        <Agents />
      </div>
      <div className="wrap">
        <Sources />
      </div>
      <div className="wrap" id="waitlist">
        {closeBlock}
      </div>
      <div className="wrap">
        <Footer />
      </div>
    </>
  );
}

function Topbar() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark" aria-hidden="true"></span>
        <span>radar</span>
      </div>
      <nav>
        <span>001 · The miss</span>
        <span>002 · The find</span>
        <span>003 · The plan</span>
      </nav>
      <div className="meta">EST. 2026 · BRAZIL</div>
    </header>
  );
}

function CornerMeta() {
  return (
    <div className="corner br">
      <div>built with claude opus 4.7</div>
      <div className="tiny">cerebral valley · 2026-04 · agpl-3.0</div>
    </div>
  );
}

function Hero({ heroCta }: { heroCta: React.ReactNode }) {
  return (
    <section className="hero">
      <div className="hero-text">
        <p className="hero-eyebrow">
          <span className="dot"></span> Built with Claude Opus 4.7
        </p>
        <h1>
          Radar<span className="cursor" aria-hidden="true"></span>
        </h1>
        <p className="subhead">
          A visual history of the opportunities Brazilian developers miss.
        </p>
      </div>
      <div className="art">
        <div className="plate"></div>
        <RadarDish />
      </div>
      <div className="hero-cta">{heroCta}</div>
    </section>
  );
}

function Pain() {
  return (
    <section>
      <div className="sec-label">
        <span className="n">001</span>
        <span>The miss</span>
        <span className="bar"></span>
      </div>
      <div className="pain">
        <div>
          <h2>A pipeline, invisible to the people it should reach.</h2>
          <div className="two-in-five" aria-label="2 out of 500">
            <span className="big">2</span>
            <span className="slash">/</span>
            <span className="denom">500</span>
          </div>
          <p className="caption">
            Brazilian developers admitted to Cerebral Valley &ldquo;Built with Claude Opus 4.7&rdquo;, 2026.
          </p>
        </div>

        <div className="pain-body">
          <p className="lead">
            Of the ~500 developers approved for this hackathon, only <strong>2 are Brazilian</strong>.
          </p>
          <p>
            Brazil has world-class engineering talent. The pipeline of grants, fellowships, scholarships, and accelerator
            cohorts that could compound a career is, for most developers, effectively invisible. Not because it is closed.
            Because no one indexes it for them.
          </p>
          <p>
            Radar finds them, weekly, autonomously, and writes a personal plan around them. Three Claude agents read your
            work, crawl the world, and produce a weekly radar with honest why-you reasoning and a 90-day path.
          </p>
          <p className="kicker">
            Let&apos;s change the 2-in-500 count.
            <span className="sig">, pabloaa, maintainer</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function Specimen() {
  return (
    <section>
      <div className="sec-label">
        <span className="n">002</span>
        <span>What it finds</span>
        <span className="bar"></span>
      </div>
      <div className="specimen">
        <div className="specimen-copy">
          <h3>A single weekly entry, verbatim from a real radar.</h3>
          <p>
            No job-board chrome. No &ldquo;apply now&rdquo;. Every item is an opportunity with a deadline, a funding
            figure, and a paragraph that explains, in plain terms, why your trajectory fits this one.
          </p>
          <p>
            The <em>Why you</em> line is Strategist&apos;s output. It reads your profile, the program&apos;s thesis, and
            argues the match.
          </p>
        </div>

        <article className="card" aria-label="Sample radar entry">
          <div className="crown">
            <span className="badge">
              <span className="pulse"></span>fellowship · applications open
            </span>
            <span className="id">#0142 · 2026-04-21</span>
          </div>
          <h4 className="title">Emergent Ventures</h4>
          <p className="subtitle">Mercatus Center · George Mason University</p>

          <div className="fit">
            <span className="num">84</span>
            <span className="of">/100</span>
            <span className="label">fit score</span>
          </div>

          <dl>
            <dt>Deadline</dt>
            <dd>Rolling · 2 to 3 week decision</dd>

            <dt>Funding</dt>
            <dd>R$ 5k to R$ 260k · no equity</dd>

            <dt>Commitment</dt>
            <dd>Self-directed · no cohort, no reporting theatre</dd>
          </dl>

          <div className="why">
            <span className="tag">Why you · Strategist</span>
            Your ICPC bronze, Cosseno post-exit trajectory, and T5-transformer monograph fit the Tyler Cowen
            &ldquo;unusual and unorthodox STEM talent&rdquo; thesis directly. Apply with the monograph as the
            centrepiece. Lead with the exit proof, it resolves the usual &ldquo;has this person ever shipped&rdquo;
            question in one sentence.
          </div>
        </article>
      </div>
    </section>
  );
}

function Agents() {
  return (
    <section>
      <div className="sec-label">
        <span className="n">003</span>
        <span>How it works</span>
        <span className="bar"></span>
      </div>
      <div className="agents">
        <div className="agent">
          <div className="ix">
            <span className="tick"></span>
            <span>agent 01</span>
          </div>
          <h3>
            Anamnesis<span className="cur" aria-hidden="true"></span>
          </h3>
          <p className="role">Reads you</p>
          <p>
            Ingests your GitHub, your CV, a 90-second voice note if you leave one. Builds a profile that is yours, not
            a template, and updates it the week you ship something new.
          </p>
          <div className="input">
            inputs: <span>github · cv · voice</span>
          </div>
        </div>

        <div className="agent">
          <div className="ix">
            <span className="tick"></span>
            <span>agent 02</span>
          </div>
          <h3>
            Scout<span className="cur" aria-hidden="true"></span>
          </h3>
          <p className="role">Crawls the world, weekly</p>
          <p>
            Indexes grants, fellowships, scholarships, accelerator cohorts, practice arenas, and recurring competitions
            that no one curates for Brazilian developers. Logs every source, never invents one.
          </p>
          <div className="input">
            sources: <span>1,240 and counting</span>
          </div>
        </div>

        <div className="agent">
          <div className="ix">
            <span className="tick"></span>
            <span>agent 03</span>
          </div>
          <h3>
            Strategist<span className="cur" aria-hidden="true"></span>
          </h3>
          <p className="role">Writes your plan</p>
          <p>
            Reads both. Produces a weekly radar with a fit score, a why-you paragraph, and a 90-day path. Honest when
            nothing fits this week, honest when one does.
          </p>
          <div className="input">
            output: <span>weekly radar + 90-day path</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Sources() {
  const sources = [
    { name: "FAPESP", loc: "BR" },
    { name: "Emergent Ventures", loc: "US" },
    { name: "Chevening", loc: "UK" },
    { name: "Y Combinator", loc: "US" },
    { name: "MEXT", loc: "JP" },
    { name: "Fundacao Estudar", loc: "BR" },
  ];

  return (
    <section className="sources" aria-label="Representative sources Radar indexes">
      <div className="meta">
        <span>A sample of what Scout indexes</span>
        <span>six of one thousand two hundred and forty</span>
      </div>
      <div className="strip">
        {sources.map((s, i) => (
          <Fragment key={s.name}>
            <span className="src">
              <span>{s.name}</span>
              <span className="loc">{s.loc}</span>
            </span>
            {i < sources.length - 1 && <span className="dot" aria-hidden="true"></span>}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function WaitlistCloseBlock() {
  return (
    <section className="close">
      <p>004 · join</p>
      <h2>
        Join the waitlist<span className="cur" aria-hidden="true"></span>
      </h2>
      <WaitlistForm />
      <div className="reassure">Open source, AGPL-3.0. Invite-only during beta.</div>
    </section>
  );
}

function SignedInCloseBlock({ handle }: { handle: string }) {
  return (
    <section className="close">
      <p>004 · you</p>
      <h2>
        You are signed in as @{handle}.
        <span className="cur" aria-hidden="true"></span>
      </h2>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <Link href="/radar" className="btn">
          <span className="hi">G</span>o to radar
        </Link>
        <Link
          href="/intake"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--ink-3)",
            textDecoration: "underline",
          }}
        >
          or update your intake
        </Link>
      </div>
      <div className="reassure">Open source, AGPL-3.0. Invite-only during beta.</div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="col">
        <a href="https://github.com/pablo-aa/radar">github.com/pablo-aa/radar</a>
        <a href="mailto:contato@pabloaa.com">contato@pabloaa.com</a>
      </div>
      <div className="col">
        <span>radar.pabloaa.com</span>
        <span>built with claude opus 4.7</span>
        <span>cerebral valley · 2026-04</span>
      </div>
    </footer>
  );
}
