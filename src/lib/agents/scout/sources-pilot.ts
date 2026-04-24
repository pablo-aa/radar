import type { ScoutSource } from "./types";

export const SCOUT_PILOT_SOURCES: ScoutSource[] = [
  // --- existing 5 ---
  {
    url: "https://olimpiada.ic.unicamp.br/",
    hint: "OBI Brazilian Informatics Olympiad",
    opportunity_type: "competition",
    expected_loc: "BR",
  },
  {
    url: "https://maratona.sbc.org.br/",
    hint: "Maratona SBC programming contest BR",
    opportunity_type: "competition",
    expected_loc: "BR",
  },
  {
    url: "https://icpc.global/",
    hint: "ICPC World Finals pipeline",
    opportunity_type: "competition",
    expected_loc: "global",
  },
  {
    url: "https://www.mercatus.org/emergent-ventures",
    hint: "Rolling grant, unorthodox STEM talent",
    opportunity_type: "grant",
    expected_loc: "US",
  },
  {
    url: "https://huggingface.co/spaces/HuggingFaceH4/open_llm_leaderboard",
    hint: "Hugging Face Open LLM leaderboard arena",
    opportunity_type: "arena",
    expected_loc: "remote",
  },

  // --- scholarships ---
  {
    url: "https://www.chevening.org/scholarship/brazil/",
    hint: "UK postgrad scholarship for Brazilians",
    opportunity_type: "scholarship",
    expected_loc: "UK",
  },
  {
    url: "https://fulbright.org.br/",
    hint: "US grad/research scholarships for Brazilians",
    opportunity_type: "scholarship",
    expected_loc: "US",
  },
  {
    url: "https://www.daad.org.br/",
    hint: "German academic scholarships all levels",
    opportunity_type: "scholarship",
    expected_loc: "DE",
  },
  {
    url: "https://erasmus-plus.ec.europa.eu/opportunities",
    hint: "EU academic scholarships Erasmus Mundus",
    opportunity_type: "scholarship",
    expected_loc: "EU",
  },
  {
    url: "https://www.gatescambridge.org/",
    hint: "Gates Cambridge PhD scholarship",
    opportunity_type: "scholarship",
    expected_loc: "UK",
  },
  {
    url: "https://knight-hennessy.stanford.edu/",
    hint: "Stanford Knight-Hennessy postgrad scholarship",
    opportunity_type: "scholarship",
    expected_loc: "US",
  },
  {
    url: "https://app.becas-santander.com/",
    hint: "Santander Bolsas various academic programs",
    opportunity_type: "scholarship",
    expected_loc: "global",
  },
  {
    url: "https://www.capes.gov.br/internacional/print",
    hint: "CAPES PrInt PhD sandwich program BR",
    opportunity_type: "scholarship",
    expected_loc: "BR",
  },

  // --- fellowships / AI research ---
  {
    url: "https://www.anthropic.com/research",
    hint: "Anthropic Fellows program and academic grants",
    opportunity_type: "fellowship",
    expected_loc: "US",
  },
  {
    url: "https://openai.com/residency",
    hint: "OpenAI Residency research program",
    opportunity_type: "fellowship",
    expected_loc: "US",
  },
  {
    url: "https://cohere.com/research",
    hint: "Cohere For AI Scholars program",
    opportunity_type: "fellowship",
    expected_loc: "global",
  },
  {
    url: "https://thielfellowship.org/",
    hint: "Thiel Fellowship for under-23 builders",
    opportunity_type: "fellowship",
    expected_loc: "US",
  },
  {
    url: "https://zfellows.com/",
    hint: "Z Fellows independent engineers",
    opportunity_type: "fellowship",
    expected_loc: "US",
  },
  {
    url: "https://joininteract.com/",
    hint: "Interact Fellowship US tech talent",
    opportunity_type: "fellowship",
    expected_loc: "US",
  },

  // --- accelerators ---
  {
    url: "https://www.techstars.com/apply",
    hint: "Techstars worldwide accelerator batches",
    opportunity_type: "accelerator",
    expected_loc: "global",
  },
  {
    url: "https://www.finep.gov.br/apoio-e-financiamento-externa/programas-e-linhas/programas-inovacao/start-up-brasil",
    hint: "Finep Startup Brasil accelerator",
    opportunity_type: "accelerator",
    expected_loc: "BR",
  },

  // --- competitions ---
  {
    url: "https://www.kaggle.com/competitions",
    hint: "Kaggle ongoing ML competitions",
    opportunity_type: "competition",
    expected_loc: "global",
  },
  {
    url: "https://atcoder.jp/",
    hint: "AtCoder weekly algorithmic contests Japan",
    opportunity_type: "competition",
    expected_loc: "global",
  },
  {
    url: "https://adventofcode.com/",
    hint: "Advent of Code December annual",
    opportunity_type: "competition",
    expected_loc: "global",
  },
  {
    url: "https://picoctf.org/",
    hint: "picoCTF beginner capture-the-flag",
    opportunity_type: "competition",
    expected_loc: "global",
  },
  {
    url: "https://www.hackthebox.com/",
    hint: "Hack The Box continuous CTF platform",
    opportunity_type: "competition",
    expected_loc: "global",
  },

  // --- internships ---
  {
    url: "https://www.jetro.go.jp/",
    hint: "METI AI and Tech Talent Internship Japan",
    opportunity_type: "internship",
    expected_loc: "JP",
  },
  {
    url: "https://buildyourfuture.withgoogle.com/programs/step",
    hint: "Google STEP internship early CS students",
    opportunity_type: "internship",
    expected_loc: "global",
  },
  {
    url: "https://fellowship.mlh.io/",
    hint: "MLH Fellowship remote OSS internship",
    opportunity_type: "internship",
    expected_loc: "remote",
  },

  // --- community programs ---
  {
    url: "https://education.github.com/experts",
    hint: "GitHub Campus Experts community program",
    opportunity_type: "community",
    expected_loc: "global",
  },
  {
    url: "https://developers.google.com/community/experts",
    hint: "Google Developer Experts program",
    opportunity_type: "community",
    expected_loc: "global",
  },

  // --- events BR ---
  {
    url: "https://thedevconf.com/",
    hint: "The Developer's Conference BR",
    opportunity_type: "event",
    expected_loc: "BR",
  },
  {
    url: "https://rubyconf.com.br/",
    hint: "RubyConf Brasil annual event",
    opportunity_type: "event",
    expected_loc: "BR",
  },
  {
    url: "https://brasil.campus-party.org/",
    hint: "Campus Party Brasil event",
    opportunity_type: "event",
    expected_loc: "BR",
  },
];
