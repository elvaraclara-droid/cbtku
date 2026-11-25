import { describe, it, expect } from "vitest";
import { gradeQuestionResponse } from "@/lib/grading/auto-grader";

describe("Server Auto-Grading Engine", () => {
  it("grades single_choice correctly", () => {
    const resCorrect = gradeQuestionResponse(
      {
        questionId: "q1",
        questionType: "single_choice",
        weight: 2,
        mcmaScoringMode: "exact_match",
        allowNegativeScore: false,
        options: [
          { id: "o1", is_correct: false },
          { id: "o2", is_correct: true },
        ],
        statements: [],
      },
      {
        selectedOptionId: "o2",
        selectedOptionIds: [],
        statementAnswers: {},
        essayAnswer: null,
      }
    );
    expect(resCorrect.awardedScore).toBe(2);
    expect(resCorrect.isCorrect).toBe(true);

    const resWrong = gradeQuestionResponse(
      {
        questionId: "q1",
        questionType: "single_choice",
        weight: 2,
        mcmaScoringMode: "exact_match",
        allowNegativeScore: false,
        options: [
          { id: "o1", is_correct: false },
          { id: "o2", is_correct: true },
        ],
        statements: [],
      },
      {
        selectedOptionId: "o1",
        selectedOptionIds: [],
        statementAnswers: {},
        essayAnswer: null,
      }
    );
    expect(resWrong.awardedScore).toBe(0);
    expect(resWrong.isCorrect).toBe(false);
  });

  it("grades MCMA exact_match and partial_credit with non-negative floor", () => {
    const mcmaSpec = {
      questionId: "q2",
      questionType: "mcma" as const,
      weight: 4,
      mcmaScoringMode: "partial_credit" as const,
      allowNegativeScore: false,
      options: [
        { id: "a", is_correct: true },
        { id: "b", is_correct: true },
        { id: "c", is_correct: false },
        { id: "d", is_correct: false },
      ],
      statements: [],
    };

    // 1 of 2 correct, 0 wrong => 50% of 4 = 2
    const half = gradeQuestionResponse(mcmaSpec, {
      selectedOptionId: null,
      selectedOptionIds: ["a"],
      statementAnswers: {},
      essayAnswer: null,
    });
    expect(half.awardedScore).toBe(2);
    expect(half.isCorrect).toBe(false);

    // Selecting all options (anti-gaming) => 1 - 1 = 0
    const allSelected = gradeQuestionResponse(mcmaSpec, {
      selectedOptionId: null,
      selectedOptionIds: ["a", "b", "c", "d"],
      statementAnswers: {},
      essayAnswer: null,
    });
    expect(allSelected.awardedScore).toBe(0);

    // Selecting only wrong options => clamped to 0 (non-negative)
    const onlyWrong = gradeQuestionResponse(mcmaSpec, {
      selectedOptionId: null,
      selectedOptionIds: ["c", "d"],
      statementAnswers: {},
      essayAnswer: null,
    });
    expect(onlyWrong.awardedScore).toBe(0);

    // Exact match mode requires full match
    const exactFail = gradeQuestionResponse(
      { ...mcmaSpec, mcmaScoringMode: "exact_match" },
      {
        selectedOptionId: null,
        selectedOptionIds: ["a"],
        statementAnswers: {},
        essayAnswer: null,
      }
    );
    expect(exactFail.awardedScore).toBe(0);
  });

  it("grades multi-statement true_false questions with per-statement weights", () => {
    const tfSpec = {
      questionId: "q3",
      questionType: "true_false" as const,
      weight: 3,
      mcmaScoringMode: "exact_match" as const,
      allowNegativeScore: false,
      options: [],
      statements: [
        { id: "s1", is_true: true, weight: 2 },
        { id: "s2", is_true: false, weight: 1 },
      ],
    };

    // Correct on s1 (weight 2 of 3) => 2/3 * 3 = 2.00
    const partialTf = gradeQuestionResponse(tfSpec, {
      selectedOptionId: null,
      selectedOptionIds: [],
      statementAnswers: { s1: true, s2: true },
      essayAnswer: null,
    });
    expect(partialTf.awardedScore).toBe(2);
    expect(partialTf.isCorrect).toBe(false);
  });

  it("marks essay questions as pending_manual", () => {
    const essayRes = gradeQuestionResponse(
      {
        questionId: "q4",
        questionType: "essay",
        weight: 10,
        mcmaScoringMode: "exact_match",
        allowNegativeScore: false,
        options: [],
        statements: [],
      },
      {
        selectedOptionId: null,
        selectedOptionIds: [],
        statementAnswers: {},
        essayAnswer: "Jawaban uraian siswa",
      }
    );
    expect(essayRes.gradingStatus).toBe("pending_manual");
    expect(essayRes.awardedScore).toBe(0);
  });
});
