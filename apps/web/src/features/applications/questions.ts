export type PersistableApplicationQuestion = {
  dbId: string;
  id: string;
  label: string;
  type: string;
  required: boolean;
};

export type BuildQuestionAnswerRowsInput = {
  workspaceId: string;
  applicationId: string;
  questions: PersistableApplicationQuestion[];
  answers: Record<string, string>;
};

export function buildQuestionAnswerRows({
  workspaceId,
  applicationId,
  questions,
  answers,
}: BuildQuestionAnswerRowsInput) {
  return questions.map((question) => ({
    workspaceId,
    applicationId,
    questionId: question.dbId,
    answer: answers[question.id]?.trim() ?? "",
  }));
}
