// Hardcoded constraint and ambition questions. Always asked, in this order,
// before any AI-generated follow-ups. These are the highest-leverage signals
// for the downstream Strategist (relocation, quit-job, study appetite,
// available hours, what the user actually wants), and they cost nothing to
// generate, so we ship them by default.

import type { ClarifyQuestion } from "./types";

export const ELIMINATORY_QUESTIONS: ClarifyQuestion[] = [
  {
    id: "relocate_window",
    question: "Would you move cities in the next 12 months?",
    context:
      "International programs and fellowships often require physical presence. Knowing this avoids recommendations you would dismiss right away.",
    category: "constraint",
    kind: "single_choice",
    source: "eliminatory",
    options: [
      { value: "yes_anywhere", label: "yes, anywhere" },
      { value: "yes_intl_only", label: "international only" },
      { value: "yes_specific_cities", label: "yes, but only specific cities" },
      { value: "maybe_depends", label: "maybe, depends on the program" },
      { value: "no", label: "no, staying put" },
    ],
    allow_other: true,
  },
  {
    id: "leave_job",
    question: "Would you leave your current job for the right opportunity?",
    context:
      "Full-time fellowships, accelerators, and grants usually require full dedication. Part-time programs (up to ~10h/week) do not.",
    category: "constraint",
    kind: "single_choice",
    source: "eliminatory",
    options: [
      { value: "yes_now", label: "yes, right now" },
      { value: "yes_with_runway", label: "yes, with a few months of runway" },
      { value: "only_part_time", label: "only if part-time" },
      { value: "no_keeping_job", label: "no, keeping the job" },
      { value: "n_a_no_job", label: "n/a, I do not have a job" },
    ],
    allow_other: true,
  },
  {
    id: "study_appetite",
    question: "Would you do a master's or PhD in the next 2 years?",
    context:
      "Scholarships like Fulbright, Chevening, DAAD, Lemann are huge but require this appetite. Knowing this filters half the opportunity space.",
    category: "constraint",
    kind: "single_choice",
    source: "eliminatory",
    options: [
      { value: "yes_actively", label: "yes, actively looking" },
      { value: "maybe_with_funding", label: "maybe, depending on the funding" },
      { value: "no_thanks", label: "no, focused on industry" },
      { value: "already_doing", label: "already doing or done" },
    ],
    allow_other: false,
  },
  {
    id: "time_budget",
    question:
      "How many hours per week can you dedicate to something new right now?",
    context:
      "Defines whether the Strategist surfaces light opportunities (community, events) or heavy ones (fellowship, founder program).",
    category: "time_budget",
    kind: "scale",
    source: "eliminatory",
    options: [
      { value: "lt_5", label: "< 5h" },
      { value: "5_15", label: "5 to 15h" },
      { value: "15_30", label: "15 to 30h" },
      { value: "full_time", label: "full-time" },
    ],
    allow_other: false,
  },
  {
    id: "ambition_vector",
    question: "What do you most want from the next 12 months?",
    context:
      "Pick up to two. Anchors the Strategist on the right categories; without this it tries to please every vector at once.",
    category: "ambition",
    kind: "multi_choice",
    source: "eliminatory",
    max_select: 2,
    options: [
      { value: "funding", label: "funding or capital" },
      { value: "mentorship", label: "senior mentorship" },
      { value: "community_intl", label: "international community" },
      { value: "tech_depth", label: "deepen technically" },
      { value: "visibility", label: "public visibility" },
      { value: "career_pivot", label: "pivot careers" },
      { value: "academic_path", label: "academic track" },
    ],
    allow_other: true,
  },
];
