import type { McmaScoringMode, QuestionType } from "@/types/database";

export interface QuestionGradingSpec {
  questionId: string;
  questionType: QuestionType;
  weight: number;
  mcmaScoringMode: McmaScoringMode;
  allowNegativeScore: boolean;
  options: Array<{
    id: string;
    is_correct: boolean;
  }>;
  statements: Array<{
    id: string;
    is_true: boolean;
    weight: number;
  }>;
}

export interface StudentAnswerInput {
  selectedOptionId: string | null;
  selectedOptionIds: string[];
  statementAnswers: Record<string, boolean>;
  essayAnswer: string | null;
}

export interface QuestionGradingResult {
  questionId: string;
  maxScore: number;
  awardedScore: number;
  isCorrect: boolean | null;
  gradingStatus: "auto_graded" | "pending_manual";
  breakdown: Record<string, unknown>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure server-side grading engine supporting:
 * 1. single_choice
 * 2. mcma (exact_match & partial_credit, non-negative by default)
 * 3. true_false (multi-statement weighted scoring)
 * 4. essay (queued for manual teacher grading)
 */
export function gradeQuestionResponse(
  spec: QuestionGradingSpec,
  answer: StudentAnswerInput | null | undefined
): QuestionGradingResult {
  const maxScore = round2(spec.weight);

  if (spec.questionType === "essay") {
    return {
      questionId: spec.questionId,
      maxScore,
      awardedScore: 0,
      isCorrect: null,
      gradingStatus: "pending_manual",
      breakdown: {
        type: "essay",
        has_text: Boolean(answer?.essayAnswer && answer.essayAnswer.trim().length > 0),
      },
    };
  }

  if (!answer) {
    return {
      questionId: spec.questionId,
      maxScore,
      awardedScore: 0,
      isCorrect: false,
      gradingStatus: "auto_graded",
      breakdown: { reason: "unanswered" },
    };
  }

  if (spec.questionType === "single_choice") {
    const correctOption = spec.options.find((o) => o.is_correct);
    const isCorrect = Boolean(
      correctOption && answer.selectedOptionId === correctOption.id
    );
    return {
      questionId: spec.questionId,
      maxScore,
      awardedScore: isCorrect ? maxScore : 0,
      isCorrect,
      gradingStatus: "auto_graded",
      breakdown: {
        type: "single_choice",
        selected: answer.selectedOptionId,
      },
    };
  }

  if (spec.questionType === "mcma") {
    const validOptionIds = new Set(spec.options.map((o) => o.id));
    const selectedSet = new Set(
      (answer.selectedOptionIds || []).filter((id) => validOptionIds.has(id))
    );
    const correctSet = new Set(
      spec.options.filter((o) => o.is_correct).map((o) => o.id)
    );
    const incorrectCount = spec.options.length - correctSet.size;

    if (correctSet.size === 0 || selectedSet.size === 0) {
      return {
        questionId: spec.questionId,
        maxScore,
        awardedScore: 0,
        isCorrect: false,
        gradingStatus: "auto_graded",
        breakdown: { type: "mcma", mode: spec.mcmaScoringMode, selected_count: selectedSet.size },
      };
    }

    let correctChosen = 0;
    let wrongChosen = 0;
    for (const id of selectedSet) {
      if (correctSet.has(id)) {
        correctChosen++;
      } else {
        wrongChosen++;
      }
    }

    const isExactMatch =
      correctChosen === correctSet.size && wrongChosen === 0;

    if (spec.mcmaScoringMode === "exact_match") {
      return {
        questionId: spec.questionId,
        maxScore,
        awardedScore: isExactMatch ? maxScore : 0,
        isCorrect: isExactMatch,
        gradingStatus: "auto_graded",
        breakdown: {
          type: "mcma",
          mode: "exact_match",
          correctChosen,
          wrongChosen,
          totalCorrect: correctSet.size,
        },
      };
    }

    // Partial credit mode:
    // + (correctChosen / totalCorrect) - (wrongChosen / max(1, incorrectCount))
    // Avoids negative score unless explicitly enabled by exam/question config.
    const positiveRatio = correctChosen / correctSet.size;
    const penaltyRatio =
      incorrectCount > 0 ? wrongChosen / incorrectCount : wrongChosen > 0 ? 1 : 0;
    let netRatio = positiveRatio - penaltyRatio;

    if (!spec.allowNegativeScore) {
      netRatio = Math.max(0, netRatio);
    }
    netRatio = Math.min(1, netRatio);

    const awardedScore = round2(netRatio * maxScore);

    return {
      questionId: spec.questionId,
      maxScore,
      awardedScore,
      isCorrect: isExactMatch,
      gradingStatus: "auto_graded",
      breakdown: {
        type: "mcma",
        mode: "partial_credit",
        correctChosen,
        wrongChosen,
        totalCorrect: correctSet.size,
        netRatio: round2(netRatio),
      },
    };
  }

  // true_false (multiple statements per question, weighted per statement)
  const statements = spec.statements;
  if (statements.length === 0) {
    return {
      questionId: spec.questionId,
      maxScore,
      awardedScore: 0,
      isCorrect: false,
      gradingStatus: "auto_graded",
      breakdown: { type: "true_false", error: "no_statements" },
    };
  }

  const totalStmtWeight = statements.reduce((acc, s) => acc + Math.max(0, s.weight), 0);
  let matchedWeight = 0;
  let matchedCount = 0;

  for (const stmt of statements) {
    const studentVal = answer.statementAnswers?.[stmt.id];
    if (typeof studentVal === "boolean" && studentVal === stmt.is_true) {
      matchedWeight += Math.max(0, stmt.weight);
      matchedCount++;
    }
  }

  const ratio = totalStmtWeight > 0 ? matchedWeight / totalStmtWeight : 0;
  const awardedScore = round2(ratio * maxScore);
  const allCorrect = matchedCount === statements.length;

  return {
    questionId: spec.questionId,
    maxScore,
    awardedScore,
    isCorrect: allCorrect,
    gradingStatus: "auto_graded",
    breakdown: {
      type: "true_false",
      matchedCount,
      totalStatements: statements.length,
      ratio: round2(ratio),
    },
  };
}
