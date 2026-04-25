// Hardcoded constraint and ambition questions. Always asked, in this order,
// before any AI-generated follow-ups. These are the highest-leverage signals
// for the downstream Strategist (relocation, quit-job, study appetite,
// available hours, what the user actually wants), and they cost nothing to
// generate, so we ship them by default.

import type { ClarifyQuestion } from "./types";

export const ELIMINATORY_QUESTIONS: ClarifyQuestion[] = [
  {
    id: "relocate_window",
    question: "Voce mudaria de cidade nos proximos 12 meses?",
    context:
      "Programas internacionais e fellowships geralmente exigem presenca fisica. Saber isso evita recomendacoes que voce descartaria de cara.",
    category: "constraint",
    kind: "single_choice",
    source: "eliminatory",
    options: [
      { value: "yes_anywhere", label: "sim, para qualquer lugar" },
      { value: "yes_intl_only", label: "so internacional" },
      { value: "yes_specific_cities", label: "sim, mas so cidades especificas" },
      { value: "maybe_depends", label: "talvez, depende do programa" },
      { value: "no", label: "nao, fico onde estou" },
    ],
    allow_other: true,
  },
  {
    id: "leave_job",
    question: "Voce sairia do seu trabalho atual por uma oportunidade certa?",
    context:
      "Bolsas, aceleradoras e fellowships full-time geralmente exigem dedicacao integral. Programas part-time ou de ate 10h/semana nao.",
    category: "constraint",
    kind: "single_choice",
    source: "eliminatory",
    options: [
      { value: "yes_now", label: "sim, agora" },
      { value: "yes_with_runway", label: "sim, com alguns meses de runway" },
      { value: "only_part_time", label: "so se for part-time" },
      { value: "no_keeping_job", label: "nao, vou manter o emprego" },
      { value: "n_a_no_job", label: "nao se aplica, nao tenho emprego" },
    ],
    allow_other: true,
  },
  {
    id: "study_appetite",
    question: "Voce faria mestrado ou doutorado nos proximos 2 anos?",
    context:
      "Bolsas tipo Fulbright, Chevening, DAAD, Lemann sao gigantes mas exigem essa disposicao. Saber isso filtra metade do espaco de oportunidades.",
    category: "constraint",
    kind: "single_choice",
    source: "eliminatory",
    options: [
      { value: "yes_actively", label: "sim, ja estou procurando" },
      { value: "maybe_with_funding", label: "talvez, dependendo da bolsa" },
      { value: "no_thanks", label: "nao quero, foco no mercado" },
      { value: "already_doing", label: "ja faco / ja fiz" },
    ],
    allow_other: false,
  },
  {
    id: "time_budget",
    question:
      "Quantas horas por semana voce consegue dedicar a algo novo agora?",
    context:
      "Define se a Strategist sugere oportunidades leves (community, eventos) ou pesadas (fellowship, founder program).",
    category: "time_budget",
    kind: "scale",
    source: "eliminatory",
    options: [
      { value: "lt_5", label: "< 5h" },
      { value: "5_15", label: "5 a 15h" },
      { value: "15_30", label: "15 a 30h" },
      { value: "full_time", label: "full-time" },
    ],
    allow_other: false,
  },
  {
    id: "ambition_vector",
    question: "O que voce mais quer dos proximos 12 meses?",
    context:
      "Escolha ate duas. Anchora o Strategist nas categorias certas; sem isso ele tenta agradar todos os vetores ao mesmo tempo.",
    category: "ambition",
    kind: "multi_choice",
    source: "eliminatory",
    max_select: 2,
    options: [
      { value: "funding", label: "financiamento / capital" },
      { value: "mentorship", label: "mentoria de senior" },
      { value: "community_intl", label: "comunidade internacional" },
      { value: "tech_depth", label: "aprofundar tecnicamente" },
      { value: "visibility", label: "visibilidade publica" },
      { value: "career_pivot", label: "pivotar de carreira" },
      { value: "academic_path", label: "trilha academica" },
    ],
    allow_other: true,
  },
];
