import React, { useEffect, useState } from "react";
import type { MiniQuizModuleConfig } from "../types/module-config";
import type { ModuleProps } from "./types";

export function MiniQuizModule({ config, onComplete, onBack }: ModuleProps) {
  const { questions } = config as MiniQuizModuleConfig;
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);

  useEffect(() => {
    if (questions.length === 0) {
      onComplete({ quizAnswer: [] });
    }
  }, []);

  if (questions.length === 0) {
    return null;
  }

  const question = questions[currentQuestion];
  const total = questions.length;

  function handleOptionTap(option: string) {
    const newAnswers = [...answers, option];
    if (currentQuestion < total - 1) {
      setAnswers(newAnswers);
      setCurrentQuestion(currentQuestion + 1);
    } else {
      onComplete({ quizAnswer: newAnswers });
    }
  }

  function handleBack() {
    if (currentQuestion > 0) {
      setAnswers(answers.slice(0, -1));
      setCurrentQuestion(currentQuestion - 1);
    } else {
      onBack();
    }
  }

  return (
    <div className="h-svh aspect-9/16 mx-auto flex flex-col bg-black text-white">
      {/* Back button + progress */}
      <div className="flex items-center gap-6 px-12 pt-16 pb-8">
        <button
          onClick={handleBack}
          className="flex items-center gap-4 text-white text-4xl font-medium transition-all duration-200 active:scale-95"
          aria-label="Back"
        >
          <div className="p-3 bg-white rounded-full flex">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-black"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </div>
          Back
        </button>
        <span className="ml-auto text-white/60 text-3xl">
          Question {currentQuestion + 1} of {total}
        </span>
      </div>

      {/* Question */}
      <div className="px-12 pb-12">
        <p className="text-5xl font-bold leading-tight">{question.text}</p>
      </div>

      {/* Options */}
      <div className="flex flex-col gap-6 px-12">
        {question.options.map((option) => (
          <button
            key={option}
            onClick={() => handleOptionTap(option)}
            className="w-full bg-white/10 rounded-3xl px-10 py-8 text-4xl font-medium text-left transition-all duration-200 active:scale-[0.98] active:bg-white/20 hover:bg-white/15"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
