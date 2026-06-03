export default function RevealCover() {
  return (
    <div className="absolute bottom-12 w-full left-0 text-gray-400 animate-pulse text-center">
      <span className="sm:inline">
        Press{" "}
        <kbd className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">
          Space
        </kbd>{" "}
        or tap to reveal definition
      </span>
      <span className="hidden sm:inline"> • Swipe left/right to navigate</span>
    </div>
  );
}
