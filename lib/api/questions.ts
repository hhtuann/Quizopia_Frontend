import { http } from "./http-client";
import type { Difficulty, QuestionType } from "./question-banks";

export interface QuestionOptionView {
  optionKey: string;
  content: string;
  isCorrect: boolean | null;
  position: number | null;
}

export interface QuestionDetail {
  id: number;
  code: string;
  questionType: QuestionType;
  content: string;
  difficulty: Difficulty;
  explanation: string | null;
  defaultPoints: number;
  currentVersionNumber: number | null;
  options: QuestionOptionView[];
  answerKey: unknown;
}

export interface UpdateQuestionRequest {
  content: string;
  difficulty: string;
  explanation: string | null;
  options: { optionKey: string; content: string; isCorrect: boolean }[] | null;
  expectedAnswer: string | null;
}

export function getQuestion(id: number): Promise<QuestionDetail> {
  return http.get<QuestionDetail>(`/api/questions/${id}`);
}

export function updateQuestion(id: number, req: UpdateQuestionRequest): Promise<QuestionDetail> {
  return http.put<QuestionDetail>(`/api/questions/${id}`, req);
}
