// Schema for the clarify step. Two sources of questions live in the same
// shape so the form renders them uniformly:
//   - "eliminatory": hardcoded constraint / ambition questions, always asked
//   - "ai_generated": LLM-grounded follow-ups based on GitHub + intake

export type ClarifyQuestionKind =
  | "single_choice"
  | "multi_choice"
  | "scale"
  | "short_text";

export type ClarifyQuestionCategory =
  | "intensity"        // hours/week on a specific repo, role, or project
  | "role_precision"   // exact role at a specific org
  | "disambiguation"   // is X repo job vs side vs hackathon vs study
  | "status"           // current employment / study situation
  | "constraint"       // relocate, leave job, study appetite (eliminatory)
  | "ambition"         // what the user most wants from the next year
  | "time_budget"      // hours/week available for something new
  | "language";        // language comfort (eliminatory when relevant)

export type ClarifyQuestionSource = "eliminatory" | "ai_generated";

export type ClarifyQuestionOption = {
  // Stable identifier we store in the answer payload. snake_case, no accents.
  value: string;
  // Human label rendered to the user.
  label: string;
};

export type ClarifyQuestion = {
  id: string;
  question: string;
  context: string;
  category: ClarifyQuestionCategory;
  kind: ClarifyQuestionKind;
  source: ClarifyQuestionSource;
  // Required for every kind except short_text. Order matters for "scale".
  options?: ClarifyQuestionOption[];
  // Only meaningful for choice kinds. When true, the form shows an "outro"
  // chip that toggles a free-text input which is sent in answer.other_text.
  allow_other?: boolean;
  // Hard cap for multi_choice answers. Falsy => unlimited (subject to
  // options.length).
  max_select?: number;
  // For short_text only.
  placeholder?: string;
};

export type ClarifyAnswerInput = {
  // For choice/scale: one or more selected option values. Empty => skipped.
  // For short_text: always empty (text goes into other_text).
  values: string[];
  // For "outro" / short_text. Trimmed, capped server-side.
  other_text?: string;
};

export type ClarifyAnswerInputMap = Record<string, ClarifyAnswerInput>;

// What we persist into profiles.structured_profile.clarify_answers. Includes
// labels (not just values) and the original question text so Anamnesis and
// Strategist can read clarify_answers without joining back to the cached
// question set.
export type ClarifyAnswerStored = {
  question_id: string;
  question: string;
  category: ClarifyQuestionCategory;
  kind: ClarifyQuestionKind;
  source: ClarifyQuestionSource;
  selected_values: string[];
  selected_labels: string[];
  other_text: string | null;
};

export type ClarifyAnswerStoredMap = Record<string, ClarifyAnswerStored>;

export type ClarifyQuestionSet = {
  questions: ClarifyQuestion[];
  generated_at: string;
  model: string;
};
