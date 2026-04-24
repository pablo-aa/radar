// Static fallback for the Anamnesis self-portrait.
// Used when no anamnesis_runs row exists for the current user.
// Phase 2E will populate real output JSON; this keeps the screen rendering
// meaningfully for the hackathon demo.

export type AnamnesisMeta = {
  subject: string;
  handle: string;
  locale: string;
  generated: string;
  version: string;
  basedOn: string;
  previousVersion: string;
  confidence: number;
};

export type AnamnesisHeadline = {
  lede: string;
  cur: boolean;
  caption: string;
};

export type AnamnesisTimelineNode = {
  x: number;
  y: number;
  label: string;
  meta: string;
  past?: boolean;
  now?: boolean;
  future?: boolean;
  vector?: string;
};

export type AnamnesisTimeline = {
  axis: {
    xLabels: string[];
    yLabels: string[];
  };
  nodes: AnamnesisTimelineNode[];
};

export type AnamnesisArchetype = {
  name: string;
  notName: string[];
  body: string;
  shortQuote: string;
  shortQuoteEn: string;
  evidence: string[];
  twinArchetypes: string;
};

export type AnamnesisProvince = {
  name: string;
  x: number;
  y: number;
  weight: number;
  you?: boolean;
};

export type AnamnesisTerritory = {
  lede: string;
  provinces: AnamnesisProvince[];
  verdict: string;
};

export type AnamnesisStrength = {
  n: number;
  name: string;
  score: number;
  evidence: string;
  source: string;
};

export type AnamnesisPeerNode = {
  id: number;
  x: number;
  y: number;
  ring: number;
  name: string;
  link: string;
};

export type AnamnesisPeers = {
  lede: string;
  center: { label: string; x: number; y: number };
  nodes: AnamnesisPeerNode[];
  note: string;
};

export type AnamnesisAdvantage = {
  title: string;
  body: string;
};

export type AnamnesisVector = {
  key: string;
  label: string;
  confidence: number;
  becomes: string;
  year1: string;
  year3: string;
  tradeoff: string;
  fit: string;
};

export type AnamnesisRisks = {
  lede: string;
  items: { title: string; body: string }[];
};

export type AnamnesisYearShape = {
  body: string;
  shape: string;
  counterShape: string;
};

export type AnamnesisReading = {
  kind: string;
  title: string;
  author: string;
  why: string;
};

export type AnamnesisReport = {
  meta: AnamnesisMeta;
  headline: AnamnesisHeadline;
  timeline: AnamnesisTimeline;
  archetype: AnamnesisArchetype;
  territory: AnamnesisTerritory;
  strengths: AnamnesisStrength[];
  peers: AnamnesisPeers;
  advantages: AnamnesisAdvantage[];
  vectors: AnamnesisVector[];
  risks: AnamnesisRisks;
  yearShape: AnamnesisYearShape;
  readings: AnamnesisReading[];
};

export const SAMPLE_ANAMNESIS_REPORT: AnamnesisReport = {
  meta: {
    subject: "Pablo A. Araújo",
    handle: "pabloaa",
    locale: "São Paulo · Brasil",
    generated: "2026-04-22 06:08 BRT",
    version: "v0.4 · major rev",
    basedOn:
      "GitHub (129 repos) · CV (3 pages, Apr 2026) · pabloaa.com (23 pages indexed) · voice note (1m 12s, 2026-04-19)",
    previousVersion: "v0.3 · 2026-03-04",
    confidence: 0.91,
  },

  headline: {
    lede: "Pablo, in computing, your place is here",
    cur: true,
    caption:
      "Not at the center. Not at the frontier. At a specific bend that very few people occupy, between a builder who shipped and an essayist who reads. Anamnesis maps it below.",
  },

  timeline: {
    axis: {
      xLabels: ["2018", "2020", "2022", "2024", "2026 · now", "2027", "2029"],
      yLabels: ["practice", "craft", "production", "signal", "original work"],
    },
    nodes: [
      { x: 6, y: 14, label: "first commits", meta: "2018 · Python + web", past: true },
      { x: 20, y: 28, label: "ICPC bronze · SAM", meta: "2022 · contest craft", past: true },
      { x: 36, y: 50, label: "Cosseno founded", meta: "2022 · Q3", past: true },
      { x: 56, y: 72, label: "Cosseno exit", meta: "2024 · Q2", past: true },
      {
        x: 64,
        y: 80,
        label: "T5 transformers, a reading",
        meta: "2024 · monograph",
        past: true,
      },
      { x: 74, y: 78, label: "Pablo, today", meta: "2026-04 · reading mode", now: true },
      {
        x: 86,
        y: 88,
        label: "research track",
        meta: "future · Mercatus / Open Phil",
        future: true,
        vector: "A",
      },
      {
        x: 88,
        y: 74,
        label: "next company",
        meta: "future · YC path",
        future: true,
        vector: "B",
      },
      {
        x: 92,
        y: 62,
        label: "institution builder",
        meta: "future · FAPESP / Serrapilheira",
        future: true,
        vector: "C",
      },
    ],
  },

  archetype: {
    name: "builder-essayist",
    notName: ["founder-operator", "researcher-in-residence", "staff-engineer-for-life"],
    body:
      "The builder-essayist is a rare, slightly suspicious animal. Most people choose one hand: they ship or they write. You do both, and they nourish each other, the exit gave the monograph authority, the monograph gave the next thing a point of view. You are not a founder who happens to write, nor a writer who happens to code. You are a third thing, and the confusion this causes is a feature.",
    shortQuote: "Um construtor que lê em voz alta.",
    shortQuoteEn: "A builder who reads out loud.",
    evidence: [
      "Exit on the record (Cosseno, 2024), builders ship and leave.",
      "Public-domain monograph on T5, essayists read and publish.",
      "Instagram community of 60k, the rare builder-essayist who also teaches.",
    ],
    twinArchetypes:
      "Near-neighbors: Gwern Branwen, Andy Matuschak, Nadia Asparouhova. Not identical, but the same family of animal.",
  },

  territory: {
    lede:
      "Computing is not one country. It is a continent with at least a dozen provinces, each with its own dialects, wage structures, and prestige economies. The exercise is not to pick the best province, it is to recognize which one you are already a citizen of.",
    provinces: [
      { name: "Web · frontend", x: 14, y: 14, weight: 0.08 },
      { name: "Web · backend & platform", x: 28, y: 22, weight: 0.32 },
      { name: "Mobile", x: 22, y: 42, weight: 0.05 },
      { name: "Data engineering", x: 46, y: 38, weight: 0.18 },
      { name: "Research · CS theory", x: 72, y: 18, weight: 0.14 },
      { name: "ML · applied", x: 58, y: 60, weight: 0.62 },
      { name: "ML · interpretability", x: 70, y: 72, weight: 0.86, you: true },
      { name: "Developer tooling", x: 52, y: 82, weight: 0.78 },
      { name: "Systems · infra", x: 80, y: 50, weight: 0.22 },
      { name: "Security & cryptography", x: 86, y: 36, weight: 0.06 },
      { name: "Games & graphics", x: 14, y: 74, weight: 0.04 },
      { name: "Compilers & PL", x: 40, y: 70, weight: 0.28 },
    ],
    verdict:
      "Your citizenship is dual: ML · interpretability (because of the monograph) and developer tooling (because of the Cosseno codebase, still public). The interesting finding is the overlap, these two provinces share a border that almost nobody patrols. That border is your territory.",
  },

  strengths: [
    {
      n: 1,
      name: "Reading machines the way a critic reads books",
      score: 92,
      evidence:
        "The T5 monograph is not a tutorial. It is a close reading, with the textual habits of literary criticism applied to model internals.",
      source: "pabloaa.com/t5-reading",
    },
    {
      n: 2,
      name: "Shipping under constraint",
      score: 86,
      evidence:
        "Cosseno went from first commit to acquisition in under 20 months. The pull-request graph shows disciplined weekly cadence with no heroic crunches.",
      source: "github.com/cosseno · archived",
    },
    {
      n: 3,
      name: "Teaching in public, in Portuguese",
      score: 84,
      evidence:
        "60k followers built over 3 years without paid promotion. Replies-to-posts ratio suggests dense, not passive, audience.",
      source: "instagram.com/pabloaa",
    },
    {
      n: 4,
      name: "Contest-forged debugging instinct",
      score: 78,
      evidence:
        "ICPC bronze at Latin American regionals is measurable: you compress problems faster than 92% of working engineers.",
      source: "icpc.global · 2022",
    },
    {
      n: 5,
      name: "Languages · three reading depths",
      score: 70,
      evidence:
        "Pt-br native, en-us near-native, jp-n3 functional. The last one is unusual in the BR tech cohort and is already paying off (MEXT radar entry).",
      source: "cv · language section",
    },
  ],

  peers: {
    lede:
      "Not role models. Not comparables for ego. These are the seven public figures whose trajectories resemble yours enough that studying their decisions saves you several years of trial and error.",
    center: { label: "Pablo · you", x: 50, y: 50 },
    nodes: [
      {
        id: 1,
        x: 28,
        y: 28,
        ring: 1,
        name: "Gwern Branwen",
        link: "Essayist-engineer. Same monograph habit, same refusal to pick one lane.",
      },
      {
        id: 2,
        x: 74,
        y: 26,
        ring: 1,
        name: "Andy Matuschak",
        link: "Left Apple for independent research. The 'builder who reads' move, done publicly.",
      },
      {
        id: 3,
        x: 78,
        y: 56,
        ring: 1,
        name: "Nadia Asparouhova",
        link: "OSS maintainer turned essayist. Your pt-br community role is analogous.",
      },
      {
        id: 4,
        x: 20,
        y: 66,
        ring: 2,
        name: "Filipe Deschamps",
        link: "BR teacher-builder. The audience shape is yours; the depth is yours to exceed.",
      },
      {
        id: 5,
        x: 52,
        y: 20,
        ring: 2,
        name: "Simon Willison",
        link: "Shipped Django, then became a writer. The exit-to-publish arc is the template.",
      },
      {
        id: 6,
        x: 72,
        y: 80,
        ring: 2,
        name: "Shawn Wang (swyx)",
        link: "Post-bootcamp essayist who built an AI engineer identity. Near the border you patrol.",
      },
      {
        id: 7,
        x: 30,
        y: 82,
        ring: 2,
        name: "Matt Rickard",
        link: "Ex-GitHub, now solo-researching ML systems. Similar cadence, similar gravity.",
      },
    ],
    note:
      "Note on diversity: this list is skewed male, North American, English-writing. That is a fact about who is currently legible in this archetype, not a judgment about who belongs in it. You are one of the data points that will make future lists less skewed.",
  },

  advantages: [
    {
      title: "Exit proof",
      body:
        "You closed the 'can this person actually ship' question in 2024. Almost no applicant to a research grant has this. Use it in every first sentence where it fits, then move on.",
    },
    {
      title: "Portuguese as a language of craft",
      body:
        "The pt-br technical sphere is 200M people wide and underserved. You write in it fluently. Most of your global peers cannot; they are locked out of a market you already own.",
    },
    {
      title: "Published monograph, freely readable",
      body:
        "A thing you made sits on the open web and has been read by people you respect. This is a gravitational object. Grants, fellowships, and hires are the satellites it pulls in.",
    },
    {
      title: "60k direct line",
      body:
        "An audience built slowly over three years without paid amplification. It is not a vanity metric, it is distribution, applicable to teaching, hiring, and launching.",
    },
    {
      title: "Late-career luxury, early",
      body:
        "Post-exit liquidity + no dependents + parents' home within a day's drive. You can take a three-year bet that a 32-year-old with a mortgage cannot. This is rarer than it sounds.",
    },
  ],

  vectors: [
    {
      key: "A",
      label: "Research track",
      confidence: 0.72,
      becomes:
        "A research fellow at a credible institution, writing one major paper per year.",
      year1:
        "Emergent Ventures + Open Phil + FAPESP PIPE. Three grants stacked; affiliation with a university or lab by month 10.",
      year3:
        "One paper that people cite, one monograph that sits next to the T5 reading, an invitation from a US or EU lab to visit for a quarter.",
      tradeoff:
        "You lose the founder identity. Your Instagram audience will grow more slowly. Parents and peers in SP may quietly wonder when you go back to 'real work'.",
      fit: "Highest alignment with your strengths. Lowest income in years 1-2.",
    },
    {
      key: "B",
      label: "Second company",
      confidence: 0.58,
      becomes:
        "A founder again, this time in ML tooling for pt-br or broader LatAm developer audiences.",
      year1:
        "YC S26 or W27. Co-founder hired from the top 3% of your Instagram community. Product in private beta by month 9.",
      year3:
        "Seed to Series A trajectory, or a clean failure you write about. Either way, a second exit story on the record.",
      tradeoff:
        "The T5 monograph stops getting sequels. The writing cadence drops. You enter founder time, which is corrosive to reading.",
      fit: "The path most legible to your network. Not necessarily the path most honest to your trajectory.",
    },
    {
      key: "C",
      label: "Institution builder",
      confidence: 0.64,
      becomes:
        "The person who starts a thing, a lab, a school, a publication, that persists independent of you.",
      year1:
        "A pt-br ML reading group with 20 engineers, funded by Serrapilheira or a private patron. A newsletter. A named course.",
      year3:
        "An institution other people work for. A legible place on the Brazilian technical map named after your thesis, not your face.",
      tradeoff:
        "Slowest to show results. Highest leverage in decade terms. Requires administrative work you currently find tedious.",
      fit: "The path that best uses your unfair advantages together. Also the least tested in your own experience.",
    },
  ],

  risks: {
    lede:
      "What you should not do. Anamnesis is more useful as a refusal engine than as a recommender. The negative space is where most of the value is.",
    items: [
      {
        title: "Do not take a staff-engineer role at a FAANG",
        body:
          "Your strengths are orthogonal to that promotion ladder. The money will feel large for six months and small for the next six years.",
      },
      {
        title: "Do not apply to Chevening or Rhodes-type fellowships",
        body:
          "Those reward community-leadership framing. Your story reads as technical-and-quiet, which underperforms by 3x in those panels.",
      },
      {
        title: "Do not pivot the Instagram audience toward motivation content",
        body:
          "The 60k are there for depth. Every diluted post costs you more than it pays. Keep it technical, keep it slow.",
      },
      {
        title: "Do not take VC funding to 'scale' the monograph",
        body:
          "Writing is not a startup. The offer will come; decline it cleanly. Turn the monograph into a book, or a newsletter, not a platform.",
      },
      {
        title: "Do not move to the United States yet",
        body:
          "Your unfair advantage is the pt-br sphere. Crossing the border too early turns an asset into a liability. Go for a quarter, not a decade.",
      },
    ],
  },

  yearShape: {
    body:
      "The next twelve months should feel like reading with the lights low. Not a sprint, not a sabbatical, a long, patient sitting-with. You will ship less than you did in 2024. That is correct. You will read more than you did in 2020. That is also correct. At the end of this year, there should be one new piece of writing that you are unreasonably proud of, one grant on the record, one new skill learned slowly (say, better Japanese or a compiler implementation), and zero new commitments that feel like they were said 'yes' to out of politeness. If December arrives and you are still unsure what you are building, that is not a failure; it is a diagnosis that the reading year was needed. Then, and only then, do you pick a vector.",
    shape: "slow · readerly · productive-at-the-margins",
    counterShape: "not busy · not viral · not optimized",
  },

  readings: [
    {
      kind: "book",
      title: "The Craftsman",
      author: "Richard Sennett",
      why:
        "The frame for why you read before you build. Puts the monograph habit in a tradition older than software.",
    },
    {
      kind: "paper",
      title: "On the Opportunities and Risks of Foundation Models",
      author: "Bommasani et al. · Stanford CRFM · 2021",
      why:
        "A long, imperfect, canonical paper. Your next monograph should have its density without its hedging.",
    },
    {
      kind: "essay",
      title: "The World and the Individual · (selected letters)",
      author: "Jorge Luis Borges",
      why:
        "You already write in Portuguese; Borges is how you learn to compress in a Romance language.",
    },
    {
      kind: "book",
      title: "Range",
      author: "David Epstein",
      why:
        "Gives you language for the builder-essayist archetype in public. Useful for grant applications.",
    },
    {
      kind: "paper",
      title: "A Mathematical Framework for Transformer Circuits",
      author: "Elhage et al. · Anthropic · 2021",
      why:
        "The interpretability province's founding text. Read annually until you can teach it from memory.",
    },
    {
      kind: "book",
      title: "Morte e Vida Severina",
      author: "João Cabral de Melo Neto",
      why:
        "Pt-br discipline at its hardest. The kind of reading that keeps your Portuguese prose sharp.",
    },
    {
      kind: "talk",
      title: "You and Your Research",
      author: "Richard Hamming · Bell Labs · 1986",
      why:
        "Read once per quarter. The questions it asks about the shape of a career are the questions Anamnesis is asking you now.",
    },
  ],
};
