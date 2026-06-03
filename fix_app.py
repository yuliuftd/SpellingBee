import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Remove the rest of the quiz states
states_to_remove = r'  const \[quizStarted, setQuizStarted\].*?\n.*?  const \[quizResults, setQuizResults\].*?\| null>\(null\);\n'
content = re.sub(states_to_remove, '', content, flags=re.DOTALL)

# Fix uniqueLevels type issue
levels_pattern = r'const uniqueLevels = Array\.from\(new Set\(words\.map\(\(w\) => w\.level\)\)\)\.sort\(\n    \(\(a, b\) => \(a \|\| 0\) - \(b \|\| 0\)\),\n  \);'
fixed_levels = '''const uniqueLevels: (number | null)[] = Array.from(new Set(words.map((w) => w.level ?? null))).sort(
    ((a, b) => (a || 0) - (b || 0))
  );'''
content = content.replace(levels_pattern, fixed_levels)

# Write back
with open('src/App.tsx', 'w') as f:
    f.write(content)
