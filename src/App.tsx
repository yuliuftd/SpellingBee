import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import wordsData from "./data/words.json";
import ocVocabData from "./data/oc_vocab.json";
import BeeIcon from "./icons/BeeIcon";
import SpeakerIcon from "./icons/SpeakerIcon";
import TranslateIcon from "./icons/TranslateIcon";
import { Word } from "./types";
import Quiz from "./components/Quiz";
import Footer from "./components/Footer";
import RevealCover from "./components/RevealCover";
import Instructions from "./components/Instructions";

const STORAGE_KEY = "spellingBee_unknownWords";
const OC_UNKNOWN_STORAGE_KEY = "ocReading_unknownWords";
const OC_CUSTOM_WORDS_STORAGE_KEY = "ocReading_customWords";

type VocabularyMode = "spelling" | "oc";

interface CustomWordsState {
  words: Word[];
  error: string;
}

function readUnknownIds(key: string): Set<string> {
  const saved = localStorage.getItem(key);
  if (!saved) return new Set();
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch (error) {
    console.error("Failed to parse saved review words", error);
    return new Set();
  }
}

function readCustomOcWords(): CustomWordsState {
  try {
    const saved = localStorage.getItem(OC_CUSTOM_WORDS_STORAGE_KEY);
    if (!saved) return { words: [], error: "" };
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(isWordEntry)) {
      throw new Error("Saved OC vocabulary has an invalid format.");
    }
    return { words: parsed, error: "" };
  } catch (error) {
    return {
      words: [],
      error: error instanceof Error ? error.message : "Could not read saved OC vocabulary.",
    };
  }
}

function isWordEntry(value: unknown): value is Word {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Word>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.word === "string" &&
    typeof candidate.definition === "string" &&
    typeof candidate.chineseDefinition === "string" &&
    candidate.chineseDefinition.trim().length > 0 &&
    typeof candidate.pronounce === "string" &&
    candidate.pronounce.trim().length > 0 &&
    Array.isArray(candidate.synonyms) &&
    candidate.synonyms.length > 0 &&
    candidate.synonyms.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

interface DictionaryLookup {
  pronunciation: string;
  synonyms: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

async function lookupDictionary(word: string): Promise<DictionaryLookup> {
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!response.ok) {
    throw new Error(response.status === 404 ? "No dictionary entry was found." : `Dictionary lookup failed (${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Dictionary returned an unexpected response.");
  const entry = asRecord(payload[0]);
  if (!entry) throw new Error("No dictionary entry was found.");

  const phonetics = Array.isArray(entry.phonetics) ? entry.phonetics : [];
  const pronunciation = phonetics
    .map(asRecord)
    .find((item) => typeof item?.text === "string" && item.text.trim())?.text;
  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  const synonyms = new Set<string>();

  for (const meaningValue of meanings) {
    const meaning = asRecord(meaningValue);
    const meaningSynonyms = Array.isArray(meaning?.synonyms) ? meaning.synonyms : [];
    for (const synonym of meaningSynonyms) {
      if (typeof synonym === "string" && synonym.trim()) synonyms.add(synonym.trim());
    }

    const definitions = Array.isArray(meaning?.definitions) ? meaning.definitions : [];
    for (const definitionValue of definitions) {
      const definition = asRecord(definitionValue);
      const definitionSynonyms = Array.isArray(definition?.synonyms) ? definition.synonyms : [];
      for (const synonym of definitionSynonyms) {
        if (typeof synonym === "string" && synonym.trim()) synonyms.add(synonym.trim());
      }
    }
  }

  return {
    pronunciation: typeof pronunciation === "string" ? pronunciation.trim() : "",
    synonyms: Array.from(synonyms).filter((synonym) => synonym.toLowerCase() !== word.toLowerCase()),
  };
}

async function lookupChineseMeaning(word: string): Promise<string> {
  const response = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`,
  );
  if (!response.ok) throw new Error(`Translation lookup failed (${response.status}).`);

  const payload: unknown = await response.json();
  const result = asRecord(payload);
  const responseData = asRecord(result?.responseData);
  const translatedText = responseData?.translatedText;
  if (String(result?.responseStatus) !== "200" || typeof translatedText !== "string" || !translatedText.trim()) {
    throw new Error("No Chinese translation was returned.");
  }
  return translatedText.replace(/<\/?[^>]+(>|$)/g, "").trim();
}

async function lookupSynonyms(word: string): Promise<string[]> {
  const response = await fetch(
    `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=8`,
  );
  if (!response.ok) throw new Error(`Synonym lookup failed (${response.status}).`);

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Synonym service returned an unexpected response.");
  return payload
    .map(asRecord)
    .map((item) => item?.word)
    .filter((synonym): synonym is string => typeof synonym === "string" && synonym.trim().length > 0)
    .filter((synonym) => synonym.toLowerCase() !== word.toLowerCase());
}

function App() {
  const [mode, setMode] = useState<VocabularyMode>(() =>
    new URLSearchParams(window.location.search).get("mode") === "oc" ? "oc" : "spelling",
  );
  const [autoStartQuiz, setAutoStartQuiz] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "oc" && params.get("view") === "quiz";
  });
  const [customWordsState, setCustomWordsState] = useState<CustomWordsState>(readCustomOcWords);
  const customOcWords = customWordsState.words;
  const [words] = useState<Word[]>(wordsData as Word[]);
  const activeVocabulary = useMemo(() => {
    if (mode === "spelling") return words;
    const merged = new Map(ocVocabData.map((word) => [word.word.toLowerCase(), word as Word]));
    customOcWords.forEach((word) => merged.set(word.word.toLowerCase(), word));
    return Array.from(merged.values()).sort((a, b) => a.word.localeCompare(b.word));
  }, [customOcWords, mode, words]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [unknownIdsByMode, setUnknownIdsByMode] = useState<Record<VocabularyMode, Set<string>>>(() => ({
    spelling: readUnknownIds(STORAGE_KEY),
    oc: readUnknownIds(OC_UNKNOWN_STORAGE_KEY),
  }));
  const unknownIds = unknownIdsByMode[mode];
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
  const [entryWord, setEntryWord] = useState("");
  const [entryPronunciation, setEntryPronunciation] = useState("");
  const [entryChineseDefinition, setEntryChineseDefinition] = useState("");
  const [entrySynonyms, setEntrySynonyms] = useState("");
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [entryCategory, setEntryCategory] = useState("Reading vocabulary");
  const [entryMessage, setEntryMessage] = useState("");
  const [showOcAddForm, setShowOcAddForm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const entryWordRef = useRef("");
  const autoFillWordsRef = useRef(new Set<string>());

  // Quiz mode states
  const [quizMode, setQuizMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "oc" && params.get("view") === "quiz";
  });

  // Keep the existing spelling review list separate from OC review progress.
  useEffect(() => {
    const key = mode === "oc" ? OC_UNKNOWN_STORAGE_KEY : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(Array.from(unknownIds)));
  }, [mode, unknownIds]);

  useEffect(() => {
    if (!settingsOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !settingsMenuRef.current?.contains(event.target)) {
        setSettingsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  const persistCustomOcWords = (nextWords: Word[]): boolean => {
    try {
      localStorage.setItem(OC_CUSTOM_WORDS_STORAGE_KEY, JSON.stringify(nextWords));
      setCustomWordsState({ words: nextWords, error: "" });
      return true;
    } catch (error) {
      setCustomWordsState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not save the OC vocabulary.",
      }));
      return false;
    }
  };

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
      ? activeVocabulary.filter((w) => unknownIds.has(w.id))
      : selectedLevel !== null
        ? activeVocabulary.filter((w) => w.level === selectedLevel)
        : activeVocabulary;

    // Apply randomization if enabled
    if (randomMode) {
      filtered = shuffleArray(filtered);
    }

    return filtered;
  }, [reviewMode, selectedLevel, unknownIds, randomMode, activeVocabulary]);

  const currentWord = activeWords[currentIndex];

  const handleJump = useCallback((input: string) => {
    if (/^\d+$/.test(input)) {
      const num = parseInt(input);
      if (num >= 1 && num <= activeWords.length) {
        setCurrentIndex(num - 1);
        setShowDefinition(false);
        setJumpInput("");
      }
      return;
    }

    if (/^[a-zA-Z]$/.test(input)) {
      const letter = input.toUpperCase();
      const sortedWords = [...activeWords].sort((a, b) =>
        a.word.localeCompare(b.word),
      );
      const matchIndex = sortedWords.findIndex((w) =>
        w.word.toUpperCase().startsWith(letter),
      );
      if (matchIndex !== -1) {
        const actualIndex = activeWords.findIndex(
          (w) => w.id === sortedWords[matchIndex].id,
        );
        setCurrentIndex(actualIndex);
        setShowDefinition(false);
        setJumpInput("");
      }
    }
  }, [activeWords]);

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
      setUnknownIdsByMode((prev) => {
        const newSet = new Set(prev[mode]);
        newSet.delete(currentWord.id);
        return { ...prev, [mode]: newSet };
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
    mode,
    currentIndex,
    activeWords.length,
    nextWord,
  ]);

  const handleUnknown = useCallback(() => {
    if (!currentWord) return;

    setUnknownIdsByMode((prev) => {
      const newSet = new Set(prev[mode]);
      newSet.add(currentWord.id);
      return { ...prev, [mode]: newSet };
    });
    setCopied(false);
    setTranslatedWord(null);
    nextWord();
  }, [currentWord, mode, nextWord]);

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
    if (completed || quizMode) return;

    let jumpTimeout: ReturnType<typeof setTimeout> | undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if focus is on an input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT"
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
    quizMode,
    handleKnown,
    handleUnknown,
    handlePrevious,
    jumpInput,
    handleJump,
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

  const changeVocabularyMode = (nextMode: VocabularyMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setEntryMessage("");
    setReviewMode(false);
    setSelectedLevel(null);
    setRandomMode(false);
    setCurrentIndex(0);
    setCompleted(false);
    setShowDefinition(false);
    setShowOcAddForm(false);
    setCopied(false);
    setTranslatedWord(null);
    setQuizMode(false);
    setAutoStartQuiz(false);
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

  const toggleQuizMode = () => {
    setQuizMode((current) => !current);
    setAutoStartQuiz(false);
    setCurrentIndex(0);
    setCompleted(false);
  };

  const autoFillMissingOcFields = async () => {
    const word = entryWord.trim();
    const wordKey = word.toLowerCase();
    if (!word || autoFillWordsRef.current.has(wordKey)) return;

    const needsPronunciation = !entryPronunciation.trim();
    const needsChineseMeaning = !entryChineseDefinition.trim();
    const needsSynonyms = !entrySynonyms.split(",").some((synonym) => synonym.trim());
    if (!needsPronunciation && !needsChineseMeaning && !needsSynonyms) {
      setEntryMessage("All vocabulary fields are already filled.");
      return;
    }

    autoFillWordsRef.current.add(wordKey);
    setAutoFillLoading(true);
    setEntryMessage(`Looking up missing details for “${word}”…`);

    const dictionaryRequest: Promise<DictionaryLookup | null> =
      needsPronunciation || needsSynonyms ? lookupDictionary(word) : Promise.resolve(null);
    const translationRequest: Promise<string | null> =
      needsChineseMeaning ? lookupChineseMeaning(word) : Promise.resolve(null);
    const synonymsRequest: Promise<string[]> =
      needsSynonyms ? lookupSynonyms(word) : Promise.resolve([]);

    try {
      const [dictionaryResult, translationResult, synonymsResult] = await Promise.allSettled([
        dictionaryRequest,
        translationRequest,
        synonymsRequest,
      ]);
      if (entryWordRef.current.trim().toLowerCase() !== wordKey) return;

      const filledFields: string[] = [];
      const errors: string[] = [];
      const dictionary = dictionaryResult.status === "fulfilled" ? dictionaryResult.value : null;
      const dictionaryError = dictionaryResult.status === "rejected"
        ? dictionaryResult.reason instanceof Error
          ? dictionaryResult.reason.message
          : "Dictionary lookup failed."
        : "";

      if (needsPronunciation) {
        if (dictionary?.pronunciation) {
          setEntryPronunciation((current) => current.trim() ? current : dictionary.pronunciation);
          filledFields.push("pronunciation");
        } else {
          errors.push(`pronunciation: ${dictionaryError || "no pronunciation was found"}`);
        }
      }

      if (needsChineseMeaning) {
        const translation = translationResult.status === "fulfilled" ? translationResult.value : null;
        if (translation) {
          setEntryChineseDefinition((current) => current.trim() ? current : translation);
          filledFields.push("Chinese meaning");
        } else {
          const reason = translationResult.status === "rejected"
            ? translationResult.reason instanceof Error
              ? translationResult.reason.message
              : "translation lookup failed"
            : "no Chinese translation was found";
          errors.push(`Chinese meaning: ${reason}`);
        }
      }

      if (needsSynonyms) {
        const foundSynonyms = new Set(dictionary?.synonyms ?? []);
        if (synonymsResult.status === "fulfilled") {
          synonymsResult.value.forEach((synonym) => foundSynonyms.add(synonym));
        }
        if (foundSynonyms.size > 0) {
          setEntrySynonyms((current) => current.trim() ? current : Array.from(foundSynonyms).join(", "));
          filledFields.push("synonyms");
        } else {
          const failures = [
            dictionaryError,
            synonymsResult.status === "rejected"
              ? synonymsResult.reason instanceof Error
                ? synonymsResult.reason.message
                : "synonym lookup failed"
              : "",
          ].filter(Boolean);
          errors.push(`synonyms: ${failures.join("; ") || "none were found"}`);
        }
      }

      const filledMessage = filledFields.length ? `Auto-filled ${filledFields.join(", ")}.` : "";
      const missingMessage = errors.length ? `Still missing ${errors.join(" · ")}.` : "";
      setEntryMessage([filledMessage, missingMessage].filter(Boolean).join(" "));
    } finally {
      autoFillWordsRef.current.delete(wordKey);
      if (entryWordRef.current.trim().toLowerCase() === wordKey) {
        setAutoFillLoading(false);
      }
    }
  };

  const handleAddOcWord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const word = entryWord.trim();
    const chineseDefinition = entryChineseDefinition.trim();
    const synonyms = entrySynonyms.split(",").map((item) => item.trim()).filter(Boolean);

    if (!word || !entryPronunciation.trim() || !chineseDefinition || synonyms.length === 0) {
      setEntryMessage("Enter the word, pronunciation, Chinese meaning, and at least one synonym.");
      return;
    }
    if (activeVocabulary.some((entry) => entry.word.toLowerCase() === word.toLowerCase())) {
      setEntryMessage(`“${word}” is already in the OC vocabulary.`);
      return;
    }

    const newWord: Word = {
      id: `oc-custom-${crypto.randomUUID()}`,
      word,
      definition: chineseDefinition,
      chineseDefinition,
      pronounce: entryPronunciation.trim(),
      type: "OC Reading",
      level: 1,
      category: entryCategory,
      synonyms,
    };
    setEntryMessage(`Writing “${word}” to oc_vocab.json…`);
    try {
      const response = await fetch("/api/oc-vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry: newWord }),
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("The vocabulary write API is unavailable. Run the app with `npm run dev`.");
      }
      const result = asRecord(payload);
      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string" ? result.error : `Vocabulary write failed (${response.status}).`,
        );
      }
      if (!isWordEntry(result?.entry)) {
        throw new Error("The vocabulary API returned an invalid saved entry.");
      }

      const savedEntry = result.entry;
      const nextWords = [...customOcWords, savedEntry];
      let cacheWarning = "";
      try {
        localStorage.setItem(OC_CUSTOM_WORDS_STORAGE_KEY, JSON.stringify(nextWords));
      } catch (error) {
        cacheWarning = error instanceof Error ? error.message : "Browser storage is unavailable.";
      }
      setCustomWordsState({ words: nextWords, error: "" });
      setEntryWord("");
      entryWordRef.current = "";
      setEntryPronunciation("");
      setEntryChineseDefinition("");
      setEntrySynonyms("");
      setEntryMessage(
        cacheWarning
          ? `Added “${word}” to oc_vocab.json. Browser cache warning: ${cacheWarning}`
          : `Added “${word}” to src/data/oc_vocab.json.`,
      );
      setAutoFillLoading(false);
      setCurrentIndex(0);
      setCompleted(false);
      setShowDefinition(false);
      setShowOcAddForm(false);
    } catch (error) {
      setEntryMessage(
        error instanceof Error
          ? `Could not write “${word}” to oc_vocab.json: ${error.message}`
          : `Could not write “${word}” to oc_vocab.json.`,
      );
    }
  };

  const handleExportOcWords = () => {
    const blob = new Blob([JSON.stringify(activeVocabulary, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "oc_vocab.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportOcWords = async (file?: File) => {
    if (!file) return;
    try {
      const imported: unknown = JSON.parse(await file.text());
      if (!Array.isArray(imported) || !imported.every(isWordEntry)) {
        throw new Error("The file must contain an array of valid OC vocabulary entries.");
      }
      const originalByWord = new Map(
        (ocVocabData as Word[]).map((entry) => [entry.word.toLowerCase(), JSON.stringify(entry)]),
      );
      const additionsAndOverrides = (imported as Word[]).filter(
        (entry) => originalByWord.get(entry.word.toLowerCase()) !== JSON.stringify(entry),
      );
      if (persistCustomOcWords(additionsAndOverrides)) {
        setEntryMessage(`Imported ${imported.length} OC vocabulary entries.`);
        setCurrentIndex(0);
        setCompleted(false);
        setShowDefinition(false);
      } else {
        setEntryMessage("The imported vocabulary could not be saved in this browser.");
      }
    } catch (error) {
      setEntryMessage(error instanceof Error ? error.message : "Could not import this vocabulary file.");
    }
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
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(currentWord.word)}&langpair=en|zh-CN`,
      );
      const data = await response.json();
      if (data.responseStatus === 200) {
        setTranslatedWord(data.responseData.translatedText);
      }
    } catch (error) {
      console.error("Translation failed:", error);
    } finally {
      setTranslating(false);
      setTimeout(() => setTranslatedWord(null), 5000); // Auto-hide translation after 5 seconds
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

  // Get unique levels
  const uniqueLevels: (number | null)[] = Array.from(
    new Set(activeVocabulary.map((w) => w.level ?? null)),
  ).sort((a, b) => (a || 0) - (b || 0));

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4">
      <header className="w-full max-w-5xl p-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between sm:gap-4">
        <div className="flex items-center gap-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
            Spelling Bee
          </h1>
          <BeeIcon size="md" floating={true} rotation={315} />
        </div>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
          <div className="flex flex-nowrap items-center gap-1" role="group" aria-label="Vocabulary mode">
            <button
              type="button"
              onClick={() => changeVocabularyMode("spelling")}
              aria-pressed={mode === "spelling"}
              aria-label="Spelling Bee vocabulary"
              className={`rounded-xl px-2 py-2 text-xs font-bold transition-colors whitespace-nowrap sm:px-4 sm:text-base ${
                mode === "spelling"
                  ? "bg-amber-500 text-white shadow-md"
                  : "bg-amber-100 text-amber-900 hover:bg-amber-200"
              }`}
            >
              <span className="sm:hidden">🐝 Spelling</span>
              <span className="hidden sm:inline">🐝 Spelling Bee</span>
            </button>
            <button
              type="button"
              onClick={() => changeVocabularyMode("oc")}
              aria-pressed={mode === "oc"}
              aria-label="OC Reading vocabulary"
              className={`rounded-xl px-2 py-2 text-xs font-bold transition-colors whitespace-nowrap sm:px-4 sm:text-base ${
                mode === "oc"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
              }`}
            >
              <span className="sm:hidden">🎯 OC Reading</span>
              <span className="hidden sm:inline">🎯 OC Reading</span>
            </button>
          </div>
        <div className="relative shrink-0" ref={settingsMenuRef}>
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            aria-haspopup="true"
            aria-controls="settings-dropdown"
            title="Settings"
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <span aria-hidden="true" className="text-xl leading-none">⚙️</span>
          </button>
          {settingsOpen && (
            <div
              id="settings-dropdown"
              className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
              aria-label="Settings"
            >
              <button
                type="button"
                onClick={() => {
                  toggleQuizMode();
                  setSettingsOpen(false);
                }}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  quizMode ? "bg-orange-100 text-orange-800" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {mode === "oc"
                  ? quizMode ? "OC Meaning Quiz (Active)" : "OC Meaning Quiz"
                  : quizMode ? "Quiz Mode (Active)" : "Quiz Mode"}
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleReviewMode();
                  setSettingsOpen(false);
                }}
                className={`mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  reviewMode ? "bg-indigo-100 text-indigo-800" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {reviewMode ? "Review Mode" : "Training Mode"}
              </button>
              {mode === "oc" && (
                <div className="mt-1 border-t border-gray-100 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOcAddForm((open) => !open);
                      setQuizMode(false);
                      setAutoStartQuiz(false);
                      setSettingsOpen(false);
                    }}
                    aria-expanded={showOcAddForm}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    {showOcAddForm ? "Hide Add Word Form" : "Add OC Word"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleExportOcWords();
                      setSettingsOpen(false);
                    }}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Export oc_vocab.json
                  </button>
                  <label className="mt-1 block cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                    Import JSON
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        setSettingsOpen(false);
                        setQuizMode(false);
                        setAutoStartQuiz(false);
                        if (file) void handleImportOcWords(file);
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </header>

      {!reviewMode && !quizMode && (
        <div className="w-full max-w-5xl px-4 pb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Sort alphabetically A to Z"
              aria-label="Sort alphabetically A to Z"
              aria-pressed={!randomMode}
              onClick={() => {
                setRandomMode(false);
                setCurrentIndex(0);
                setCompleted(false);
              }}
              className={`flex h-8 w-8 items-center justify-center transition-colors ${
                !randomMode
                  ? "text-blue-700"
                  : "text-gray-400 hover:text-blue-600"
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 6h9M3.5 10h6.5M3.5 14h4" />
                <path d="M18 18V5m-3 3 3-3 3 3" />
              </svg>
            </button>
            <button
              type="button"
              title="Shuffle randomly"
              aria-label="Shuffle randomly"
              aria-pressed={randomMode}
              onClick={() => {
                setRandomMode(true);
                setCurrentIndex(0);
                setCompleted(false);
              }}
              className={`flex h-8 w-8 items-center justify-center transition-colors ${
                randomMode
                  ? "text-purple-700"
                  : "text-gray-400 hover:text-purple-600"
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h2c4 0 6 10 10 10h5m-3-3 3 3-3 3" />
                <path d="M3 17h2c4 0 6-10 10-10h5m-3-3 3 3-3 3" />
              </svg>
            </button>
          </div>
          {mode === "spelling" && (
            <div
              role="group"
              aria-label="Spelling Bee levels"
              className="inline-flex shrink-0 overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => handleLevelSelect(null)}
                aria-pressed={selectedLevel === null}
                className={`border-r border-gray-300 px-2 py-1.5 text-xs font-semibold transition-colors sm:px-2.5 sm:text-sm ${
                  selectedLevel === null
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                All
              </button>
              {uniqueLevels.map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => handleLevelSelect(level || 1)}
                  aria-pressed={selectedLevel === (level || 1)}
                  className={`border-r border-gray-300 px-2 py-1.5 text-xs font-semibold transition-colors last:border-r-0 sm:px-2.5 sm:text-sm ${
                    selectedLevel === (level || 1)
                      ? "bg-blue-600 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  L{level || 1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <section className="w-full max-w-5xl px-4">
        <div className="h-5 overflow-hidden text-sm leading-5">
          {mode === "oc" && !quizMode && customWordsState.error && (
            <p className="truncate text-red-600" role="alert">{customWordsState.error}</p>
          )}
          {mode === "oc" && !quizMode && !customWordsState.error && entryMessage && (
            <p className="truncate text-indigo-700" role="status">{entryMessage}</p>
          )}
        </div>
        {mode === "oc" && !quizMode && showOcAddForm && (
            <form
              onSubmit={handleAddOcWord}
              className="mt-3 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm"
            >
              <div className="mb-4">
                <h2 className="text-lg font-bold text-indigo-900">OC Reading Quick Add</h2>
                <p className="text-sm text-gray-500">Save a new reading word to this browser’s OC vocabulary.</p>
              </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-sm font-semibold text-gray-700">
                Word
                <input
                  required
                  value={entryWord}
                  onChange={(event) => {
                    const value = event.target.value;
                    entryWordRef.current = value;
                    setEntryWord(value);
                    setEntryMessage("");
                    setAutoFillLoading(autoFillWordsRef.current.has(value.trim().toLowerCase()));
                  }}
                  onBlur={() => void autoFillMissingOcFields()}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                  placeholder="e.g. reluctant"
                />
                <span className="mt-1 block text-[11px] font-normal text-gray-500">
                  Missing fields auto-fill when you leave this field.
                </span>
              </label>
              <label className="text-sm font-semibold text-gray-700">
                Pronunciation
                <input
                  required
                  value={entryPronunciation}
                  onChange={(event) => setEntryPronunciation(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                  placeholder="/rɪˈlʌktənt/"
                />
              </label>
              <label className="text-sm font-semibold text-gray-700">
                Chinese meaning
                <input
                  required
                  value={entryChineseDefinition}
                  onChange={(event) => setEntryChineseDefinition(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                  placeholder="不情愿的"
                />
              </label>
              <label className="text-sm font-semibold text-gray-700">
                English synonyms
                <input
                  required
                  value={entrySynonyms}
                  onChange={(event) => setEntrySynonyms(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                  placeholder="unwilling, hesitant"
                />
              </label>
              <label className="text-sm font-semibold text-gray-700">
                Category
                <select
                  value={entryCategory}
                  onChange={(event) => setEntryCategory(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal"
                >
                  <option>Reading vocabulary</option>
                  <option>Emotion</option>
                  <option>Attitude</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void autoFillMissingOcFields()}
                disabled={!entryWord.trim() || autoFillLoading}
                className="rounded-lg bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {autoFillLoading ? "Filling…" : "Auto-fill missing fields"}
              </button>
              <button
                type="submit"
                disabled={autoFillLoading}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
              >
                Add word
              </button>
            </div>
            </form>
        )}
      </section>

      <main
        className="w-full max-w-2xl text-center"
        style={{ marginTop: reviewMode ? "30px" : "20px" }}
      >
        {quizMode ? (
          <Quiz
            words={activeVocabulary}
            uniqueLevels={uniqueLevels}
            mode={mode === "oc" ? "meaning" : "spelling"}
            autoStart={autoStartQuiz}
            onExit={() => {
              setQuizMode(false);
              setAutoStartQuiz(false);
            }}
            handleSpeak={handleSpeak}
          />
        ) : (
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
                  <span className="font-bold text-gray-800">
                    {unknownIds.size}
                  </span>{" "}
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
                  Back to Training Mode
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
                    <p className="text-lg font-semibold text-blue-600">
                      {translatedWord}
                    </p>
                  </div>
                )}
                <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-4">
                  <h2 className="text-4xl sm:text-6xl font-extrabold text-gray-900 tracking-tight">
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
                {mode === "oc" && currentWord?.category && (
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-500">
                    {currentWord.category}
                  </p>
                )}
                <div
                  className={`transition-opacity duration-300 ${showDefinition ? "opacity-100" : "opacity-0"}`}
                >
                  <div className="flex items-center justify-center gap-3 mb-6">
                    <p className="text-2xl text-gray-600 leading-relaxed max-w-xl">
                      {mode === "oc"
                        ? currentWord?.chineseDefinition ?? currentWord?.definition
                        : currentWord?.definition}
                    </p>
                    {(currentWord?.definition || currentWord?.chineseDefinition) && (
                      <SpeakerIcon
                        isPlaying={speakingKey === "definition"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSpeak(
                            mode === "oc"
                              ? currentWord.chineseDefinition ?? currentWord.definition
                              : currentWord.definition,
                            "definition",
                          );
                        }}
                        title="Read definition aloud"
                      />
                    )}
                  </div>

                  {mode === "oc" && currentWord?.synonyms && currentWord.synonyms.length > 0 && (
                    <p className="mb-5 text-base text-indigo-700">
                      Synonyms: {currentWord.synonyms.join(", ")}
                    </p>
                  )}

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
                {!showDefinition && <RevealCover />}
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

            {/* Instructions about keys */}
            {!completed && activeWords.length > 0 && (
              <Instructions
                handlePrevious={handlePrevious}
                setShowDefinition={setShowDefinition}
                handleKnown={handleKnown}
                handleUnknown={handleUnknown}
              />
            )}

            {/* Jump Feature Hint */}
            {!completed && activeWords.length > 0 && <Footer />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
