import { useState, useEffect } from "react";
import { Word } from "../types";

interface QuizProps {
  words: Word[];
  uniqueLevels: (number | null)[];
  onExit: () => void;
  handleSpeak: (text: string, key: string) => void;
}

export default function Quiz({ words, uniqueLevels, onExit, handleSpeak }: QuizProps) {
  const [quizLevel, setQuizLevel] = useState<number | null>(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<Word[]>([]);
  const [quizCurrentIndex, setQuizCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [quizResults, setQuizResults] = useState<{
    correct: number;
    total: number;
    answers: { word: string; userAnswer: string; correct: boolean }[];
  } | null>(null);

  // Auto-play word in quiz mode when a question appears
  useEffect(() => {
    if (quizStarted && quizQuestions.length > 0) {
      const currentQ = quizQuestions[quizCurrentIndex];
      if (currentQ?.word) {
        handleSpeak(currentQ.word, "quiz");
      }
    }
  }, [quizStarted, quizCurrentIndex, quizQuestions, handleSpeak]);

  const shuffleArray = (arr: Word[]): Word[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const startQuiz = (level: number | null) => {
    setQuizLevel(level);
    const levelWords = level !== null ? words.filter((w) => w.level === level) : words;
    const shuffled = shuffleArray(levelWords);
    const selected = shuffled.slice(0, 10);
    setQuizQuestions(selected);
    setQuizCurrentIndex(0);
    setUserAnswers(new Array(selected.length).fill(""));
    setQuizResults(null);
    setQuizStarted(true);
  };

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
      const isCorrect = uAnswer.toLowerCase().trim() === q.word.toLowerCase();
      if (isCorrect) correctCount++;
      return {
        word: q.word,
        userAnswer: uAnswer,
        correct: isCorrect,
      };
    });

    setQuizResults({
      correct: correctCount,
      total: quizQuestions.length,
      answers,
    });
    setQuizStarted(false);
  };

  const resetQuiz = () => {
    setQuizLevel(null);
    setQuizStarted(false);
    setQuizQuestions([]);
    setQuizCurrentIndex(0);
    setUserAnswers([]);
    setQuizResults(null);
    onExit();
  };

  if (!quizStarted && !quizResults) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-12 space-y-6">
        <h2 className="text-3xl font-bold text-orange-600 mb-8">Quiz Mode 📝</h2>
        <p className="text-gray-600 text-lg mb-6">Select a level to start a 10-question spelling quiz:</p>
        <div className="flex flex-wrap justify-center gap-3">
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
        </div>

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
              <p className="text-sm text-gray-600">
                Expected: <span className="font-mono text-gray-900">{answer.word}</span>
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
            className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={resetQuiz}
            className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-colors"
          >
            Exit Quiz
          </button>
        </div>
      </div>
    );
  }

  return null;
}