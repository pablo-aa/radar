import type { ScoutSource } from "./types";

export const SCOUT_PILOT_SOURCES: ScoutSource[] = [
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
];
