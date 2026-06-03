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
  );
}
