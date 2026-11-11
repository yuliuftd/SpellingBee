import { useState, useEffect, useRef, useCallback } from "react";
import { Word } from "../types";

type QuizMode = "spelling" | "meaning";

interface QuizOption {
  id: string;
  label: string;
}

interface QuizProps {
  words: Word[];
  uniqueLevels: (number | null)[];
  onExit: () => void;
  handleSpeak: (text: string, key: string) => void;
  mode?: QuizMode;
  autoStart?: boolean;
}

const OC_QUIZ_SCORE_STORAGE_KEY = "spellingBee_ocQuizScores";

interface QuizScore {
  completedAt: string;
  correct: number;
  total: number;
  percentage: number;
}

interface QuizScoreHistory {
  scores: QuizScore[];
  error: string;
}

function isQuizScore(value: unknown): value is QuizScore {
  if (typeof value !== "object" || value === null) return false;
  const score = value as Partial<QuizScore>;
  return (
    typeof score.completedAt === "string" &&
    Number.isFinite(Date.parse(score.completedAt)) &&
    Number.isInteger(score.correct) &&
    Number.isInteger(score.total) &&
    Number.isInteger(score.percentage) &&
    (score.correct ?? -1) >= 0 &&
    (score.total ?? 0) > 0 &&
    (score.correct ?? Infinity) <= (score.total ?? 0) &&
    (score.percentage ?? -1) >= 0 &&
    (score.percentage ?? 101) <= 100
  );
}

function readQuizScoreHistory(): QuizScoreHistory {
  try {
    const saved = localStorage.getItem(OC_QUIZ_SCORE_STORAGE_KEY);
    if (!saved) return { scores: [], error: "" };
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(isQuizScore)) {
      throw new Error("Saved OC quiz scores have an invalid format.");
    }
    return { scores: parsed, error: "" };
  } catch (error) {
    console.error("Could not read saved OC quiz scores.", error);
    return {
      scores: [],
      error: error instanceof Error ? error.message : "Could not read saved OC quiz scores.",
    };
  }
}

function QuizScoreHistoryChart({ scores, error }: QuizScoreHistory) {
  const chartLeft = 52;
  const chartTop = 18;
  const chartWidth = 570;
  const chartHeight = 150;
  const points = scores.map((score, index) => {
    const x = scores.length === 1
      ? chartLeft + chartWidth / 2
      : chartLeft + (index / (scores.length - 1)) * chartWidth;
    const y = chartTop + ((100 - score.percentage) / 100) * chartHeight;
    return { x, y, score };
  });

  return (
    <section className="rounded-xl bg-gray-50 p-4 text-left" aria-label="OC quiz score history">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-gray-800">OC Quiz Score History</h3>
        {scores.length > 0 && (
          <p className="text-sm text-gray-600">
            Latest: <span className="font-bold text-indigo-700">{scores[scores.length - 1].percentage}%</span>
          </p>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-red-700" role="alert">{error}</p>}
      {scores.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Complete an OC quiz to start your score history.</p>
      ) : (
        <>
          <svg
            viewBox="0 0 640 220"
            className="w-full"
            role="img"
            aria-label={`OC quiz scores over ${scores.length} attempts`}
          >
            {[0, 50, 100].map((value) => {
              const y = chartTop + ((100 - value) / 100) * chartHeight;
              return (
                <g key={value}>
                  <line x1={chartLeft} x2={chartLeft + chartWidth} y1={y} y2={y} stroke="#d1d5db" strokeDasharray="4 4" />
                  <text x={chartLeft - 8} y={y + 4} textAnchor="end" fill="#6b7280" fontSize="12">{value}%</text>
                </g>
              );
            })}
            {points.length > 1 && (
              <polyline
                fill="none"
                stroke="#4f46e5"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
              />
            )}
            {points.map(({ x, y, score }, index) => (
              <circle key={`${score.completedAt}-${index}`} cx={x} cy={y} r="4" fill="#4f46e5">
                <title>
                  Attempt {index + 1}: {score.correct}/{score.total} ({score.percentage}%) on{" "}
                  {new Date(score.completedAt).toLocaleString()}
                </title>
              </circle>
            ))}
            <text x={chartLeft} y="202" fill="#6b7280" fontSize="12">Attempt 1</text>
            <text x={chartLeft + chartWidth} y="202" textAnchor="end" fill="#6b7280" fontSize="12">
              Attempt {scores.length}
            </text>
          </svg>
        </>
      )}
    </section>
  );
}

function shuffleArray<T,>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function Quiz({
  words,
  uniqueLevels,
  onExit,
  handleSpeak,
  mode = "spelling",
  autoStart = false,
}: QuizProps) {
  const [quizLevel, setQuizLevel] = useState<number | null>(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<Word[]>([]);
  const [quizOptions, setQuizOptions] = useState<QuizOption[][]>([]);
  const [quizCurrentIndex, setQuizCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [quizResults, setQuizResults] = useState<{
    correct: number;
    total: number;
    answers: { word: string; expectedAnswer: string; userAnswer: string; correct: boolean }[];
  } | null>(null);
  const [scoreHistory, setScoreHistory] = useState<QuizScoreHistory>(() =>
    mode === "meaning" ? readQuizScoreHistory() : { scores: [], error: "" },
  );
  const autoStartApplied = useRef(false);

  // Auto-play word in quiz mode when a question appears
  useEffect(() => {
    if (quizStarted && quizQuestions.length > 0) {
      const currentQ = quizQuestions[quizCurrentIndex];
      if (currentQ?.word) {
        handleSpeak(currentQ.word, "quiz");
      }
    }
  }, [quizStarted, quizCurrentIndex, quizQuestions, handleSpeak]);

  const startQuiz = useCallback((level: number | null) => {
    setQuizLevel(level);
    const levelWords = mode === "meaning" || level === null
      ? words
      : words.filter((w) => w.level === level);
    const shuffled = shuffleArray(levelWords);
    const selected = shuffled.slice(0, 10);
    const options = mode === "meaning"
      ? selected.map((question) => {
          const correctOption = {
            id: question.id,
        label: question.definition,
          };
          const distractors = shuffleArray(
            words.filter((candidate) => candidate.id !== question.id),
          )
            .map((candidate) => ({
              id: candidate.id,
              label: candidate.definition,
            }))
            .filter((option, index, list) =>
              option.label !== correctOption.label &&
              list.findIndex((item) => item.label === option.label) === index,
            )
            .slice(0, 3);
          return shuffleArray([correctOption, ...distractors]);
        })
      : [];
    setQuizQuestions(selected);
    setQuizOptions(options);
    setQuizCurrentIndex(0);
    setUserAnswers(new Array(selected.length).fill(""));
    setQuizResults(null);
    setQuizStarted(true);
  }, [mode, words]);

  useEffect(() => {
    if (autoStart && !autoStartApplied.current) {
      autoStartApplied.current = true;
      startQuiz(null);
    }
  }, [autoStart, startQuiz]);

  const handleQuizAnswerChange = (val: string) => {
    setUserAnswers((prev) => {
      const next = [...prev];
      next[quizCurrentIndex] = val;
      return next;
    });
  };

  const goToNextQuizQuestion = () => {
    if (quizCurrentIndex < quizQuestions.length - 1) {
      setQuizCurrentIndex(quizCurrentIndex + 1);
    }
  };

  const goToPrevQuizQuestion = () => {
    if (quizCurrentIndex > 0) {
      setQuizCurrentIndex(quizCurrentIndex - 1);
    }
  };

  const submitQuizAnswer = () => {
    let correctCount = 0;
    const answers = quizQuestions.map((q, idx) => {
      const uAnswer = userAnswers[idx] || "";
      const selectedOption = quizOptions[idx]?.find((option) => option.id === uAnswer);
      const expectedAnswer = mode === "meaning"
        ? q.definition
        : q.word;
      const isCorrect = mode === "meaning"
        ? uAnswer === q.id
        : uAnswer.toLowerCase().trim() === q.word.toLowerCase();
      if (isCorrect) correctCount++;
      return {
        word: q.word,
        expectedAnswer,
        userAnswer: mode === "meaning" ? selectedOption?.label ?? "" : uAnswer,
        correct: isCorrect,
      };
    });

    setQuizResults({
      correct: correctCount,
      total: quizQuestions.length,
      answers,
    });
    if (mode === "meaning" && quizQuestions.length > 0) {
      const score: QuizScore = {
        completedAt: new Date().toISOString(),
        correct: correctCount,
        total: quizQuestions.length,
        percentage: Math.round((correctCount / quizQuestions.length) * 100),
      };
      const nextHistory = { scores: [...scoreHistory.scores, score], error: "" };
      setScoreHistory(nextHistory);
      try {
        localStorage.setItem(OC_QUIZ_SCORE_STORAGE_KEY, JSON.stringify(nextHistory.scores));
      } catch (error) {
        console.error("Could not save the OC quiz score.", error);
        setScoreHistory({
          ...nextHistory,
          error: error instanceof Error ? error.message : "Could not save the OC quiz score.",
        });
      }
    }
    setQuizStarted(false);
  };

  const resetQuiz = () => {
    setQuizLevel(null);
    setQuizStarted(false);
    setQuizQuestions([]);
    setQuizOptions([]);
    setQuizCurrentIndex(0);
    setUserAnswers([]);
    setQuizResults(null);
    onExit();
  };

  if (!quizStarted && !quizResults) {
    if (mode === "meaning") {
      return (
        <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-12 space-y-6">
          <h2 className="text-3xl font-bold text-indigo-700">OC Vocabulary Quiz 🎯</h2>
          <p className="text-gray-600 text-lg">
            Choose the correct English definition for 10 randomly selected OC reading words.
          </p>
          <p className="text-sm text-gray-500">{words.length} words available</p>
          <QuizScoreHistoryChart {...scoreHistory} />
          <button
            onClick={() => startQuiz(null)}
            disabled={words.length === 0}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors"
          >
            Start 10-word quiz
          </button>
          <button
            onClick={resetQuiz}
            className="block mx-auto text-sm text-gray-500 hover:text-gray-800"
          >
            Back to vocabulary
          </button>
        </div>
      );
    }
    return (
      <div className="bg-white rounded-2xl shadow-xl p-12 space-y-6">
        <h2 className="text-3xl font-bold text-orange-600 mb-8">Quiz Mode 📝</h2>
        <p className="text-gray-600 text-lg mb-6">Select a level to start a 10-question spelling quiz:</p>
        <div className="sm:hidden w-full">
          <select
            defaultValue=""
            onChange={(e) => startQuiz(e.target.value === "all" ? null : Number(e.target.value))}
            className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl font-semibold text-gray-700 focus:outline-none focus:border-orange-500 shadow-sm"
          >
            <option value="" disabled>Select a level...</option>
            <option value="all">All Levels</option>
            {uniqueLevels.map((level) => (
              <option key={level} value={level || 1}>Level {level || 1}</option>
            ))}
          </select>
        </div>
        <div className="hidden sm:flex flex-wrap justify-center gap-3">
          <button
            onClick={() => startQuiz(null)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
          >
            All Levels
          </button>
          {uniqueLevels.map((level) => (
            <button
              key={level}
              onClick={() => startQuiz(level || 1)}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
            >
              Level {level || 1}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (quizStarted && quizQuestions.length > 0) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-12 space-y-6">
        <div className="mb-6">
          <p className="text-gray-500 text-lg mb-2">Question {quizCurrentIndex + 1} of {quizQuestions.length}</p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-orange-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((quizCurrentIndex + 1) / quizQuestions.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {mode === "meaning" ? (
          <div className="space-y-5">
            <h3 className="text-lg text-gray-600">Choose the correct English definition:</h3>
            <p className="text-4xl font-bold text-gray-900">
              {quizQuestions[quizCurrentIndex]?.word}
            </p>
            {quizQuestions[quizCurrentIndex]?.pronounce && (
              <p className="text-gray-500">{quizQuestions[quizCurrentIndex].pronounce}</p>
            )}
            <div className="grid gap-3 text-left">
              {(quizOptions[quizCurrentIndex] ?? []).map((option, index) => (
                <button
                  type="button"
                  key={`${option.id}-${index}`}
                  onClick={() => handleQuizAnswerChange(option.id)}
                  aria-pressed={userAnswers[quizCurrentIndex] === option.id}
                  className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                    userAnswers[quizCurrentIndex] === option.id
                      ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                      : "border-gray-200 bg-white text-gray-700 hover:border-indigo-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <h3 className="text-xl text-gray-600">Definition:</h3>
            <p className="text-2xl text-gray-800">{quizQuestions[quizCurrentIndex]?.definition}</p>

            {quizQuestions[quizCurrentIndex]?.example && (
              <div>
                <h4 className="text-lg text-gray-600 mb-2">Example:</h4>
                <p className="text-lg text-gray-700 italic">{quizQuestions[quizCurrentIndex].example}</p>
              </div>
            )}

            <button
              onClick={() => handleSpeak(quizQuestions[quizCurrentIndex]?.word || "", "quiz")}
              className="mt-6 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-semibold"
            >
              🔊 Hear the word
            </button>

            <div className="mt-8">
              <label className="block text-gray-600 font-semibold mb-3">Type the word:</label>
              <input
                type="text"
                value={userAnswers[quizCurrentIndex] || ""}
                onChange={(e) => handleQuizAnswerChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    if (quizCurrentIndex < quizQuestions.length - 1) {
                      goToNextQuizQuestion();
                    } else {
                      submitQuizAnswer();
                    }
                  }
                }}
                placeholder="Type and press Enter"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg font-lg text-center text-2xl focus:outline-none focus:border-orange-600"
                autoFocus
              />
              <p className="text-sm text-gray-500 mt-2">
                {(userAnswers[quizCurrentIndex] || "").length} / {quizQuestions[quizCurrentIndex]?.word.length || 0} characters
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-4">
          {quizCurrentIndex > 0 && (
            <button
              onClick={goToPrevQuizQuestion}
              className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-colors"
            >
              Go back
            </button>
          )}
          {quizCurrentIndex < quizQuestions.length - 1 ? (
            <button
              onClick={goToNextQuizQuestion}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              Go next
            </button>
          ) : (
            <button
              onClick={submitQuizAnswer}
              className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors"
            >
              Check Answer
            </button>
          )}
        </div>
      </div>
    );
  }

  if (quizResults && !quizStarted) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-12 space-y-6">
        <h2 className="text-4xl font-bold text-orange-600">Quiz Complete! 🎊</h2>
        <div className="text-6xl font-bold text-orange-500 my-8">
          {quizResults.correct} / {quizResults.total}
        </div>
        <p className="text-xl text-gray-600">
          You got {Math.round((quizResults.correct / quizResults.total) * 100)}% correct!
        </p>
        {mode === "meaning" && <QuizScoreHistoryChart {...scoreHistory} />}

        <div className="bg-gray-50 rounded-lg p-6 max-h-96 overflow-y-auto space-y-4 text-left">
          <h3 className="font-bold text-lg text-gray-800 text-center">Results:</h3>
          {quizResults.answers.map((answer, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg ${
                answer.correct ? "bg-green-100 border-l-4 border-green-500" : "bg-red-100 border-l-4 border-red-500"
              }`}
            >
              <p className="font-semibold text-gray-800">Question {idx + 1}</p>
              {mode === "meaning" && (
                <p className="text-sm text-gray-600">
                  Word: <span className="font-mono text-gray-900">{answer.word}</span>
                </p>
              )}
              <p className="text-sm text-gray-600">
                Expected: <span className="font-mono text-gray-900">{answer.expectedAnswer}</span>
              </p>
              <p className="text-sm text-gray-600">
                Your answer: <span className="font-mono text-gray-900">{answer.userAnswer || "(empty)"}</span>
              </p>
              <p className={`text-sm font-semibold mt-2 ${answer.correct ? "text-green-700" : "text-red-700"}`}>
                {answer.correct ? "✓ Correct" : "✗ Incorrect"}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
          <button
            onClick={() => startQuiz(quizLevel)}
            className="w-full sm:w-auto px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={resetQuiz}
            className="w-full sm:w-auto px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-colors"
          >
            Exit Quiz
          </button>
        </div>
      </div>
    );
  }

  return null;
}