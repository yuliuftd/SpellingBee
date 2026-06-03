import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Remove state variables
state_pattern = re.compile(r'  const \[quizLevel, setQuizLevel\].*?\| null>\(null\);\n', re.DOTALL)
content = state_pattern.sub('', content)

# Remove useEffect for auto-play
useEffect_pattern = re.compile(r'  // Auto-play word in quiz mode when a question appears\n  useEffect\(\(\) => \{\n.*?\}, \[quizMode, quizStarted, quizCurrentIndex, quizQuestions, handleSpeak\]\);\n\n', re.DOTALL)
content = useEffect_pattern.sub('', content)

# Remove quiz handlers
handlers_pattern = re.compile(r'  // Quiz mode handlers\n  const startQuiz =.*?const resetQuiz = \(\) => \{\n.*?setQuizResults\(null\);\n  \};\n\n', re.DOTALL)
content = handlers_pattern.sub('', content)

# Replace the Quiz Mode UI
quiz_ui_pattern = re.compile(r'        \{\/\* Quiz Mode UI \*\/\}\n        \{quizMode && !quizStarted && !quizResults && \(\n.*?        \{\/\* Learning Mode UI - Hidden when in Quiz \*\/\}\n        \{!quizMode && \(\n        <>\n', re.DOTALL)
replacement = '''        {quizMode ? (
          <Quiz
            words={words}
            uniqueLevels={uniqueLevels}
            onExit={() => setQuizMode(false)}
            handleSpeak={handleSpeak}
          />
        ) : (
        <>
'''
content = quiz_ui_pattern.sub(replacement, content)

with open('src/App.tsx', 'w') as f:
    f.write(content)
