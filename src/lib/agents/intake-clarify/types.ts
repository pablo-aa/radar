export type ClarifyQuestion = {
  id: string;
  question: string;
  context: string;
  placeholder: string;
  kind: "short" | "long";
};

export type ClarifyQuestionSet = {
  questions: ClarifyQuestion[];
  generated_at: string;
  model: string;
};

export type ClarifyAnswerMap = Record<string, string>;
