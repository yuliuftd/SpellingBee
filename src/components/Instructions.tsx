import React from "react";

export default function Instructions({
  handlePrevious,
  setShowDefinition,
  handleKnown,
  handleUnknown,
}: {
  handlePrevious: () => void;
  setShowDefinition: React.Dispatch<React.SetStateAction<boolean>>;
  handleKnown: () => void;
  handleUnknown: () => void;
}) {
  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:hidden">
        <button
          onClick={() => handlePrevious()}
          className="bg-white border-2 border-gray-200 text-gray-700 py-3 rounded-xl font-semibold shadow-sm active:bg-gray-50 flex items-center justify-center gap-2"
        >
          <span>←</span> Back
        </button>
        <button
          onClick={() => setShowDefinition((prev) => !prev)}
          className="bg-blue-50 border-2 border-blue-200 text-blue-700 py-3 rounded-xl font-semibold shadow-sm active:bg-blue-100 flex items-center justify-center gap-2"
        >
          <span>👁️</span> Reveal
        </button>
        <button
          onClick={() => handleUnknown()}
          className="bg-orange-50 border-2 border-orange-200 text-orange-700 py-3 rounded-xl font-semibold shadow-sm active:bg-orange-100 flex items-center justify-center gap-2"
        >
          <span>⭐</span> Practice
        </button>
        <button
          onClick={() => handleKnown()}
          className="bg-green-50 border-2 border-green-200 text-green-700 py-3 rounded-xl font-semibold shadow-sm active:bg-green-100 flex items-center justify-center gap-2"
        >
          <span>✓</span> Know It
        </button>
      </div>

      <div className="hidden mt-12 sm:flex sm:justify-center gap-6 text-sm text-gray-500">
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
    </>
  );
}
