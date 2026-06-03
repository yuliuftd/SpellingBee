import React from "react";

export default function Footer() {
  return (
    <div className="mt-8 text-center text-xs text-gray-400 space-y-1">
      <p>
        💡 Type a number to jump to that word position (e.g.,{" "}
        <kbd className="font-mono bg-gray-100 px-2 py-1 rounded">100</kbd>)
      </p>
      <p>
        💡 Type a letter to jump to the first word starting with that letter
        (e.g., <kbd className="font-mono bg-gray-100 px-2 py-1 rounded">M</kbd>)
      </p>
    </div>
  );
}
