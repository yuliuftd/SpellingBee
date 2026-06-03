import { useState, useEffect, useCallback, useMemo } from "react";
import wordsData from "./data/words.json";
import BeeIcon from "./icons/BeeIcon";
import SpeakerIcon from "./icons/SpeakerIcon";
import TranslateIcon from "./icons/TranslateIcon";

interface Word {
  id: string;
  word: string;
  definition: string;
  pronounce?: string;
  type?: string;
  example?: string;
  level?: number;
}

const STORAGE_KEY = "spellingBee_unknownWords";

function App() {
  const [words] = useState<Word[]>(wordsData);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [unknownIds, setUnknownIds] = useState<Set<string>>(new Set());
  const [reviewMode, setReviewMode] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [randomMode, setRandomMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [jumpInput, setJumpInput] = useState("");
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [translatedWord, setTranslatedWord] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  
  // Quiz mode states
  const [quizMode, setQuizMode] = useState(false);
  const [quizLevel, setQuizLevel] = useState<number | null>(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<Word[]>([]);
  const [quizCurrentIndex, setQuizCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [quizResults, setQuizResults] = useState<{ correct: number; total: number; answers: { word: string; userAnswer: string; correct: boolean }[] } | null>(null);

  // Load unknown IDs from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUnknownIds(new Set(parsed));
      } catch (e) {
        console.error("Failed to parse localStorage", e);
      }
    }
  }, []);

  // Save unknown IDs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(unknownIds)));
  }, [unknownIds]);

  // Shuffle function
  const shuffleArray = (arr: Word[]): Word[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Derived state for the active list - memoized to prevent re-shuffling on every render
  const activeWords = useMemo(() => {
    let filtered = reviewMode
      ? words.filter((w) => unknownIds.has(w.id))
      : selectedLevel !== null
        ? words.filter((w) => w.level === selectedLevel)
        : words;

    // Apply randomization if enabled
    if (randomMode) {
      filtered = shuffleArray(filtered);
    }

    return filtered;
  }, [reviewMode, selectedLevel, unknownIds, randomMode, words]);

  const currentWord = activeWords[currentIndex];

  const nextWord = useCallback(() => {
    if (currentIndex < activeWords.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setShowDefinition(false);
      setCopied(false);
      setTranslatedWord(null);
    } else {
      setCompleted(true);
    }
  }, [currentIndex, activeWords.length]);

  const handleKnown = useCallback(() => {
    if (!currentWord) return;

    // If we are in review mode and mark it as known, remove it from unknown list
    if (reviewMode && unknownIds.has(currentWord.id)) {
      setUnknownIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(currentWord.id);
        return newSet;
      });
      // In review mode, when we remove the current item, the array length shrinks.
      // So we don't necessarily need to increment currentIndex, but we should handle
      // end of list condition. Let's just adjust index to stay in bounds.
      if (currentIndex >= activeWords.length - 1) {
        setCompleted(true);
      }
      setShowDefinition(false);
      setCopied(false);
      setTranslatedWord(null);
    } else {
      nextWord();
    }
  }, [
    currentWord,
    reviewMode,
    unknownIds,
    currentIndex,
    activeWords.length,
    nextWord,
  ]);

  const handleUnknown = useCallback(() => {
    if (!currentWord) return;

    setUnknownIds((prev) => {
      const newSet = new Set(prev);
      newSet.add(currentWord.id);
      return newSet;
    });
    setCopied(false);
    setTranslatedWord(null);
    nextWord();
  }, [currentWord, nextWord]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setShowDefinition(false);
      setCopied(false);
      setTranslatedWord(null);
    }
  }, [currentIndex]);

  // Keyboard Event Listener
  useEffect(() => {
    if (completed) return;

    let jumpTimeout: ReturnType<typeof setTimeout> | undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if focus is on an input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Check for jump input (numbers and letters)
      if (/^[0-9a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        const newInput = jumpInput + e.key;
        setJumpInput(newInput);

        // Clear previous timeout
        clearTimeout(jumpTimeout);

        // Set new timeout to clear input after 2 seconds of no typing
        jumpTimeout = setTimeout(() => {
          setJumpInput("");
        }, 2000);

        return;
      }

      // Backspace to delete from jump input
      if (e.code === "Backspace" && jumpInput.length > 0) {
        e.preventDefault();
        setJumpInput(jumpInput.slice(0, -1));
        clearTimeout(jumpTimeout);
        jumpTimeout = setTimeout(() => {
          setJumpInput("");
        }, 2000);
        return;
      }

      // Enter to execute jump
      if (e.code === "Enter" && jumpInput.length > 0) {
        e.preventDefault();
        handleJump(jumpInput);
        clearTimeout(jumpTimeout);
        return;
      }

      // Escape to cancel jump
      if (e.code === "Escape" && jumpInput.length > 0) {
        e.preventDefault();
        setJumpInput("");
        clearTimeout(jumpTimeout);
        return;
      }

      // Prevent default scrolling for space and arrows
      if (["Space", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(e.code)) {
        e.preventDefault();
      }

      if (e.code === "Space") {
        setShowDefinition((prev) => !prev);
      } else if (e.code === "ArrowRight") {
        handleKnown();
      } else if (e.code === "ArrowDown") {
        handleUnknown();
      } else if (e.code === "ArrowLeft") {
        handlePrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(jumpTimeout);
    };
  }, [
    completed,
    handleKnown,
    handleUnknown,
    handlePrevious,
    jumpInput,
    activeWords,
  ]);

  // Touch event handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;

    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    const threshold = 50; // minimum swipe distance in pixels

    // Swipe left: go to next word
    if (diff > threshold) {
      handleKnown();
    }
    // Swipe right: go to previous word
    else if (diff < -threshold) {
      handlePrevious();
    }

    setTouchStart(null);
  };

  const toggleReviewMode = () => {
    setReviewMode((prev) => !prev);
    setCurrentIndex(0);
    setCompleted(false);
    setShowDefinition(false);
    setCopied(false);
    setTranslatedWord(null);
  };

  const handleLevelSelect = (level: number | null) => {
    setSelectedLevel(level);
    setCurrentIndex(0);
    setCompleted(false);
    setShowDefinition(false);
    setCopied(false);
    setTranslatedWord(null);
  };

  const restart = () => {
    setCurrentIndex(0);
    setCompleted(false);
    setShowDefinition(false);
    setCopied(false);
    setTranslatedWord(null);
  };

  const handleCopy = () => {
    if (currentWord?.word) {
      navigator.clipboard.writeText(currentWord.word).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handleTranslate = async () => {
    if (!currentWord?.word || translatedWord) return;
    
    setTranslating(true);
    try {
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(currentWord.word)}&langpair=en|zh-CN`
      );
      const data = await response.json();
      if (data.responseStatus === 200) {
        setTranslatedWord(data.responseData.translatedText);
      }
    } catch (error) {
      console.error("Translation failed:", error);
    } finally {
      setTranslating(false);
    }
  };

  const handleSpeak = useCallback((text: string, key: string) => {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Slightly slower rate for clarity
    
    utterance.onstart = () => setSpeakingKey(key);
    utterance.onend = () => setSpeakingKey(null);
    utterance.onerror = () => setSpeakingKey(null);
    
    window.speechSynthesis.speak(utterance);
  }, []);

  // Auto-play word in quiz mode when a question appears
  useEffect(() => {
    if (quizMode && quizStarted && quizQuestions.length > 0) {
      const currentQ = quizQuestions[quizCurrentIndex];
      if (currentQ?.word) {
        handleSpeak(currentQ.word, "quiz");
      }
    }
  }, [quizMode, quizStarted, quizCurrentIndex, quizQuestions, handleSpeak]);

  const handleJump = (input: string) => {
    // Check if input is a number
    if (/^\d+$/.test(input)) {
      const num = parseInt(input);
      if (num >= 1 && num <= activeWords.length) {
        setCurrentIndex(num - 1);
        setShowDefinition(false);
        setJumpInput("");
      }
      return;
    }

    // Check if input is a single letter
    if (/^[a-zA-Z]$/.test(input)) {
      const letter = input.toUpperCase();
      // Get words sorted alphabetically (default), then find first matching letter
      const sortedWords = [...activeWords].sort((a, b) =>
        a.word.localeCompare(b.word),
      );
      const matchIndex = sortedWords.findIndex((w) =>
        w.word.toUpperCase().startsWith(letter),
      );
      if (matchIndex !== -1) {
        // Find the index in activeWords
        const actualIndex = activeWords.findIndex(
          (w) => w.id === sortedWords[matchIndex].id,
        );
        setCurrentIndex(actualIndex);
        setShowDefinition(false);
        setJumpInput("");
      }
      return;
    }
  };

  // Quiz mode handlers
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
    // Generate results for all questions
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
    setQuizMode(false);
    setQuizLevel(null);
    setQuizStarted(false);
    setQuizQuestions([]);
    setQuizCurrentIndex(0);
    setUserAnswers([]);
    setQuizResults(null);
  };

  // Get unique levels
  const uniqueLevels = Array.from(new Set(words.map((w) => w.level))).sort(
    (a, b) => (a || 0) - (b || 0),
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <header className="w-full p-4 flex flex-row justify-between items-center max-w-4xl gap-4">
        <div className="flex items-center gap-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Spelling Bee</h1>
          <BeeIcon size="md" floating={true} rotation={315} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setQuizMode(!quizMode)}
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${
              quizMode
                ? "bg-orange-600 text-white hover:bg-orange-700"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {quizMode ? "Quiz Mode (Active)" : "Quiz Mode"}
          </button>
          <button
            onClick={toggleReviewMode}
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${
              reviewMode
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {reviewMode ? "Review Mode (Active)" : "All Words Mode"}
          </button>
        </div>
      </header>

      {/* Level Tabs */}
      {!reviewMode && !quizMode && (
        <div className="w-full p-4 flex justify-center gap-2 flex-wrap max-w-4xl">
          <button
            onClick={() => handleLevelSelect(null)}
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${
              selectedLevel === null
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            All Levels
          </button>
          {uniqueLevels.map((level) => (
            <button
              key={level}
              onClick={() => handleLevelSelect(level || 1)}
              className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                selectedLevel === (level || 1)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Level {level || 1}
            </button>
          ))}
        </div>
      )}

      {/* Alphabetic / Random Mode Toggle */}
      {!reviewMode && !quizMode && (
        <div className="w-full p-4 flex justify-center gap-2 flex-wrap max-w-4xl">
          <button
            onClick={() => {
              setRandomMode(false);
              setCurrentIndex(0);
              setCompleted(false);
            }}
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${
              !randomMode
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            A–Z (Alphabetic)
          </button>
          <button
            onClick={() => {
              setRandomMode(true);
              setCurrentIndex(0);
              setCompleted(false);
            }}
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${
              randomMode
                ? "bg-purple-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            🎲 (Random)
          </button>
        </div>
      )}

      <main
        className="w-full max-w-2xl text-center"
        style={{ marginTop: reviewMode ? "30px" : "20px" }}>
        
        {/* Quiz Mode UI */}
        {quizMode && !quizStarted && !quizResults && (
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
        )}

        {/* Quiz Question UI */}
        {quizMode && quizStarted && quizQuestions.length > 0 && (
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
              <p className="text-sm text-gray-500 mt-2">{(userAnswers[quizCurrentIndex] || "").length} / {quizQuestions[quizCurrentIndex]?.word.length || 0} characters</p>
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
        )}

        {/* Quiz Results UI */}
        {quizMode && quizResults && !quizStarted && (
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
                <div key={idx} className={`p-4 rounded-lg ${answer.correct ? "bg-green-100 border-l-4 border-green-500" : "bg-red-100 border-l-4 border-red-500"}`}>
                  <p className="font-semibold text-gray-800">Question {idx + 1}</p>
                  <p className="text-sm text-gray-600">Expected: <span className="font-mono text-gray-900">{answer.word}</span></p>
                  <p className="text-sm text-gray-600">Your answer: <span className="font-mono text-gray-900">{answer.userAnswer || "(empty)"}</span></p>
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
        )}

        {/* Learning Mode UI - Hidden when in Quiz */}
        {!quizMode && (
        <>

        {completed ? (
          <div className="bg-white rounded-2xl shadow-xl p-12 space-y-6">
            <h2 className="text-4xl font-bold text-green-600">
              Session Complete! 🎉
            </h2>
            <p className="text-gray-600 text-lg">
              {reviewMode
                ? "You've gone through your review list."
                : "You've reached the end of the vocabulary list."}
            </p>
            <p className="text-gray-500">
              You currently have{" "}
              <span className="font-bold text-gray-800">{unknownIds.size}</span>{" "}
              words in your "Need Practice" list.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
              <button
                onClick={restart}
                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-colors w-full sm:w-auto"
              >
                Start Over
              </button>
              {unknownIds.size > 0 && !reviewMode && (
                <button
                  onClick={toggleReviewMode}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors w-full sm:w-auto"
                >
                  Review Unknown Words
                </button>
              )}
            </div>
          </div>
        ) : activeWords.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-12">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              No words to review!
            </h2>
            <p className="text-gray-600">
              Your "Need Practice" list is empty. Great job!
            </p>
            <button
              onClick={toggleReviewMode}
              className="mt-8 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-colors w-full sm:w-auto"
            >
              Back to All Words
            </button>
          </div>
        ) : (
          <div
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-12 h-[400px] sm:h-auto sm:min-h-[400px] overflow-y-auto flex flex-col justify-space-between relative cursor-pointer select-none"
            onClick={() => setShowDefinition((prev) => !prev)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="absolute top-4 right-4 flex flex-col gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Copy word"
              >
                {copied ? (
                  <svg
                    className="w-5 h-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </button>
              <TranslateIcon
                isLoading={translating}
                isTranslated={!!translatedWord}
                disabled={translating}
                onClick={(e) => {
                  e.stopPropagation();
                  if (translatedWord) {
                    setTranslatedWord(null);
                  } else {
                    handleTranslate();
                  }
                }}
              />
            </div>
            {translatedWord && (
              <div className="absolute top-20 right-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-center z-10 max-w-xs">
                <p className="text-gray-600 text-xs mb-1">Chinese:</p>
                <p className="text-lg font-semibold text-blue-600">{translatedWord}</p>
              </div>
            )}
            <div className="flex items-center justify-center gap-4 mb-4">
              <h2 className="text-6xl font-extrabold text-gray-900 tracking-tight">
                {currentWord?.word}
              </h2>
              <SpeakerIcon
                isPlaying={speakingKey === "word"}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSpeak(currentWord?.word || "", "word");
                }}
                title="Read word aloud"
              />
            </div>
            <div className="flex items-center justify-center gap-4 mb-4">
              {currentWord?.type && (
                <p className="text-sm font-semibold text-gray-600 mb-4">
                  {currentWord.type},
                </p>
              )}
              {currentWord?.pronounce && (
                <p className="text-lg text-gray-500 mb-4">
                  (say {currentWord.pronounce})
                </p>
              )}
            </div>
            <div
              className={`transition-opacity duration-300 ${showDefinition ? "opacity-100" : "opacity-0"}`}
            >
              <div className="flex items-center justify-center gap-3 mb-6">
                <p className="text-2xl text-gray-600 leading-relaxed max-w-xl">
                  {currentWord?.definition}
                </p>
                {currentWord?.definition && (
                  <SpeakerIcon
                    isPlaying={speakingKey === "definition"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpeak(currentWord.definition, "definition");
                    }}
                    title="Read definition aloud"
                  />
                )}
              </div>

              {currentWord?.example && (
                <div className="flex items-center justify-center gap-3">
                  <p className="text-lg text-gray-500 italic max-w-xl">
                    {currentWord.example}
                  </p>
                  <SpeakerIcon
                    isPlaying={speakingKey === "example"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpeak(currentWord.example || "", "example");
                    }}
                    title="Read example aloud"
                  />
                </div>
              )}
            </div>

            {!showDefinition && (
              <div className="absolute bottom-12 w-full left-0 text-gray-400 animate-pulse text-center">
                <span className="sm:inline">
                  Press{" "}
                  <kbd className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">
                    Space
                  </kbd>{" "}
                  or tap to reveal definition
                </span>
                <span className="hidden sm:inline">
                  {" "}
                  • Swipe left/right to navigate
                </span>
              </div>
            )}
          </div>
        )}
        {!completed && activeWords.length > 0 && (
          <div className="mt-4 text-gray-500 font-medium">
            Word {currentIndex + 1} of {activeWords.length}
            {reviewMode && (
              <span className="ml-2 text-indigo-500">
                ({unknownIds.size} remaining to review)
              </span>
            )}
          </div>
        )}
        {/* Jump Modal */}
        {jumpInput && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-sm">
              <p className="text-gray-600 mb-4">Jump to:</p>
              <div className="text-5xl font-bold text-blue-600 mb-6 font-mono">
                {jumpInput}
              </div>
              <p className="text-gray-500 text-sm mb-4">
                {/^\d+$/.test(jumpInput)
                  ? `Word #${jumpInput}${parseInt(jumpInput) > activeWords.length ? " (out of range)" : ""}`
                  : `Words starting with "${jumpInput.toUpperCase()}"`}
              </p>
              <div className="text-gray-400 text-xs space-y-2">
                <p>
                  Press{" "}
                  <kbd className="font-mono bg-gray-100 px-2 py-1 rounded">
                    Enter
                  </kbd>{" "}
                  to jump
                </p>
                <p>
                  Press{" "}
                  <kbd className="font-mono bg-gray-100 px-2 py-1 rounded">
                    Backspace
                  </kbd>{" "}
                  to delete
                </p>
                <p>
                  Press{" "}
                  <kbd className="font-mono bg-gray-100 px-2 py-1 rounded">
                    Esc
                  </kbd>{" "}
                  to cancel
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Instructions Footer */}
        {!completed && activeWords.length > 0 && (
          <div className="mt-6 sm:mt-12 grid grid-cols-2 sm:flex sm:justify-center gap-4 sm:gap-6 text-sm text-gray-500">
            <div
              onClick={() => handlePrevious()}
              className="flex flex-col items-center cursor-pointer hover:text-gray-700 transition-colors"
            >
              <button className="w-35 font-mono bg-white shadow-sm border border-gray-200 px-3 py-2 rounded-md mb-2 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all">
                Left Arrow ←
              </button>
              <span>Go Back</span>
            </div>
            <div
              onClick={() => setShowDefinition((prev) => !prev)}
              className="flex flex-col items-center cursor-pointer hover:text-gray-700 transition-colors"
            >
              <button className="w-35 font-mono bg-white shadow-sm border border-gray-200 px-3 py-2 rounded-md mb-2 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all">
                Space
              </button>
              <span>Toggle Reveal</span>
            </div>
            <div
              onClick={() => handleKnown()}
              className="flex flex-col items-center cursor-pointer hover:text-gray-700 transition-colors"
            >
              <button className="w-35 font-mono bg-white shadow-sm border border-gray-200 px-3 py-2 rounded-md mb-2 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all">
                Right Arrow →
              </button>
              <span>I Know It (Skip)</span>
            </div>
            <div
              onClick={() => handleUnknown()}
              className="flex flex-col items-center cursor-pointer hover:text-gray-700 transition-colors"
            >
              <button className="w-35 font-mono bg-white shadow-sm border border-gray-200 px-3 py-2 rounded-md mb-2 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all">
                Down Arrow ↓
              </button>
              <span>Need Practice</span>
            </div>
          </div>
        )}

        {/* Jump Feature Hint */}
        {!completed && activeWords.length > 0 && (
          <div className="mt-8 text-center text-xs text-gray-400 space-y-1">
            <p>
              💡 Type a number to jump to that word position (e.g.,{" "}
              <kbd className="font-mono bg-gray-100 px-2 py-1 rounded">100</kbd>
              )
            </p>
            <p>
              💡 Type a letter to jump to the first word starting with that
              letter (e.g.,{" "}
              <kbd className="font-mono bg-gray-100 px-2 py-1 rounded">M</kbd>)
            </p>
          </div>
        )}
        </>
        )}
      </main>
    </div>
  );
}

export default App;
