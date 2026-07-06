"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'faculty' | 'admin';
}

function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem('icare_user');
  return userStr ? JSON.parse(userStr) : null;
}

function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('icare_user');
    localStorage.removeItem('icare_token');
    void fetch('/api/auth/logout', { method: 'POST' });
  }
}

interface Question {
  id: string;
  quiz_id: string;
  content: string;
  options: string[];
  correct_answer: number;
  explanation: string;
  competencies: string[];
}

interface Quiz {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  category: string;
}

const quizQuestions: Record<string, Question[]> = {
  "1": [
    {
      id: "q1",
      quiz_id: "1",
      content: "What is the normal range for adult heart rate?",
      options: ["60-100 bpm", "50-80 bpm", "70-120 bpm", "80-140 bpm"],
      correct_answer: 0,
      explanation: "Normal adult heart rate ranges from 60 to 100 beats per minute.",
      competencies: ["Vital Signs", "Assessment"],
    },
    {
      id: "q2",
      quiz_id: "1",
      content: "What is the normal adult respiratory rate?",
      options: ["12-20 breaths/min", "8-12 breaths/min", "16-24 breaths/min", "20-28 breaths/min"],
      correct_answer: 0,
      explanation: "Normal adult respiratory rate is 12-20 breaths per minute.",
      competencies: ["Vital Signs", "Respiratory Assessment"],
    },
    {
      id: "q3",
      quiz_id: "1",
      content: "Which vital sign indicates potential infection?",
      options: ["Elevated temperature", "Normal pulse", "Low blood pressure", "Normal respiratory rate"],
      correct_answer: 0,
      explanation: "Fever (elevated temperature) is a common sign of infection.",
      competencies: ["Vital Signs", "Infection Assessment"],
    },
    {
      id: "q4",
      quiz_id: "1",
      content: "What is the normal blood pressure range?",
      options: ["120/80 mmHg or less", "140/90 mmHg or less", "100/60 mmHg or less", "130/85 mmHg or less"],
      correct_answer: 0,
      explanation: "Normal adult blood pressure is less than 120/80 mmHg.",
      competencies: ["Vital Signs", "Cardiovascular Assessment"],
    },
    {
      id: "q5",
      quiz_id: "1",
      content: "What is the normal oxygen saturation (SpO2) range?",
      options: ["95-100%", "90-95%", "85-90%", "80-85%"],
      correct_answer: 0,
      explanation: "Normal SpO2 is 95-100% in healthy adults.",
      competencies: ["Vital Signs", "Oxygenation"],
    },
  ],
  "2": [
    {
      id: "q6",
      quiz_id: "2",
      content: "What should be documented in patient notes?",
      options: ["All of the above", "Only vital signs", "Only medications", "Only complaints"],
      correct_answer: 0,
      explanation: "Complete documentation includes all relevant patient information.",
      competencies: ["Documentation", "Clinical Skills"],
    },
    {
      id: "q7",
      quiz_id: "2",
      content: "When should patient vitals be reassessed?",
      options: ["Every 4-6 hours for stable patients", "Once a day", "Only when symptoms worsen", "Every 2 hours"],
      correct_answer: 0,
      explanation: "For stable patients, vital signs are typically reassessed every 4-6 hours.",
      competencies: ["Vital Signs", "Assessment Frequency"],
    },
    {
      id: "q8",
      quiz_id: "2",
      content: "Which is the correct format for documenting vital signs?",
      options: ["HR: 72, BP: 120/80", "HR 72 & BP 120/80", "HR-72 BP-120/80", "HR=72, BP=120/80"],
      correct_answer: 0,
      explanation: "Standard format uses colons and commas for clarity.",
      competencies: ["Documentation", "Clinical Skills"],
    },
    {
      id: "q9",
      quiz_id: "2",
      content: "What is the priority when documenting patient observations?",
      options: ["Accuracy and timeliness", "Brevity", "Detailed descriptions", "Use of medical jargon"],
      correct_answer: 0,
      explanation: "Accurate and timely documentation is essential for patient safety.",
      competencies: ["Documentation", "Clinical Skills"],
    },
  ],
  "3": [
    {
      id: "q10",
      quiz_id: "3",
      content: "What is the priority when a patient shows symptoms?",
      options: ["Assess the patient immediately", "Check the chart", "Notify the doctor", "Document observations"],
      correct_answer: 0,
      explanation: "Patient safety is always the priority - assess immediately.",
      competencies: ["Clinical Decision", "Priority Setting"],
    },
    {
      id: "q11",
      quiz_id: "3",
      content: "A patient has BP 160/95, HR 100, Temp 38.5°C. What action is priority?",
      options: ["Notify the nurse/doctor", "Give medication", "Complete documentation", "Take vital signs again"],
      correct_answer: 0,
      explanation: "Elevated BP and fever indicate potential deterioration - notify healthcare provider.",
      competencies: ["Clinical Decision", "Critical Thinking"],
    },
    {
      id: "q12",
      quiz_id: "3",
      content: "What is the first step in clinical decision making?",
      options: ["Assess the patient", "Review orders", "Administer medication", "Document"],
      correct_answer: 0,
      explanation: "Assessment is the first step in the nursing process.",
      competencies: ["Nursing Process", "Clinical Decision"],
    },
    {
      id: "q13",
      quiz_id: "3",
      content: "A patient reports chest pain. What should you do first?",
      options: ["Perform ECG", "Give pain medication", "Document the complaint", "Call family"],
      correct_answer: 0,
      explanation: "Chest pain requires immediate assessment - ECG is priority.",
      competencies: ["Clinical Decision", "Emergency Response"],
    },
  ],
};

const quizzes: Quiz[] = [
  { id: "1", title: "Vital Signs Assessment", description: "Test your knowledge on monitoring vital signs", difficulty: "beginner", category: "Nursing Foundations" },
  { id: "2", title: "Patient Documentation", description: "Learn proper clinical documentation", difficulty: "intermediate", category: "Clinical Skills" },
  { id: "3", title: "Clinical Decision Making", description: "Case-based clinical reasoning", difficulty: "advanced", category: "Critical Thinking" },
];

export default function QuizzesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ question_id: string; answer: number; correct: boolean }[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [quizCompleted, setQuizCompleted] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push("/login");
    } else {
      setUser(currentUser);
    }
  }, [router]);

  const handleStartQuiz = (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setAnswers([]);
    setShowResult(false);
    setStartTime(Date.now());
    setQuizCompleted(false);
  };

  const handleAnswer = () => {
    if (selectedAnswer === null || !selectedQuiz) return;

    const questions = quizQuestions[selectedQuiz.id] || [];
    const question = questions[currentQuestion];
    const isCorrect = selectedAnswer === question.correct_answer;

    setAnswers([...answers, { question_id: question.id, answer: selectedAnswer, correct: isCorrect }]);
    setShowResult(true);
  };

  const handleNext = () => {
    const questions = quizQuestions[selectedQuiz?.id || ""] || [];
    
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      setQuizCompleted(true);
    }
  };

  const handleExit = () => {
    setSelectedQuiz(null);
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setAnswers([]);
    setShowResult(false);
    setQuizCompleted(false);
  };

  const calculateScore = () => {
    const correct = answers.filter(a => a.correct).length;
    const questions = quizQuestions[selectedQuiz?.id || ""] || [];
    return Math.round((correct / questions.length) * 100);
  };

  const getTimeTaken = () => {
    const now = Date.now();
    return Math.round((now - startTime) / 60000);
  };

  const questions = selectedQuiz ? (quizQuestions[selectedQuiz.id] || []) : [];
  const question = questions[currentQuestion];

  if (!user) return null;

  if (selectedQuiz && question) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={handleExit}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Exit Quiz
            </button>
            <span className="text-gray-500">
              Question {currentQuestion + 1} of {questions.length}
            </span>
          </div>

          {!quizCompleted ? (
            <>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  {question.competencies.map((comp, i) => (
                    <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded">
                      {comp}
                    </span>
                  ))}
                </div>
                <h2 className="text-xl font-semibold text-gray-800 mb-6">{question.content}</h2>
                <div className="space-y-3">
                  {question.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => !showResult && setSelectedAnswer(index)}
                      disabled={showResult}
                      className={`w-full p-4 rounded-xl text-left transition-all ${
                        showResult
                          ? index === question.correct_answer
                            ? "bg-green-100 border-2 border-green-500"
                            : selectedAnswer === index
                              ? "bg-red-100 border-2 border-red-500"
                              : "bg-gray-50 border-2 border-gray-200"
                          : selectedAnswer === index
                            ? "bg-blue-100 border-2 border-blue-500"
                            : "bg-gray-50 border-2 border-gray-200 hover:border-blue-300"
                      }`}
                    >
                      <span className="font-medium text-gray-800">{option}</span>
                    </button>
                  ))}
                </div>
              </div>

              {showResult && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                  <div className={`flex items-center gap-3 mb-4 ${
                    answers[answers.length - 1]?.correct ? "text-green-600" : "text-red-600"
                  }`}>
                    {answers[answers.length - 1]?.correct ? (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <span className="font-semibold">
                      {answers[answers.length - 1]?.correct ? "Correct!" : "Incorrect"}
                    </span>
                  </div>
                  <p className="text-gray-600">{question.explanation}</p>
                </div>
              )}

              <div className="flex justify-end">
                {!showResult ? (
                  <button
                    onClick={handleAnswer}
                    disabled={selectedAnswer === null}
                    className="px-8 py-3 bg-[#1B6B7B] text-white rounded-xl font-semibold hover:bg-[#155663] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="px-8 py-3 bg-[#1B6B7B] text-white rounded-xl font-semibold hover:bg-[#155663] transition-colors"
                  >
                    {currentQuestion < questions.length - 1 ? "Next Question" : "View Results"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="text-center mb-8">
                <div className="w-24 h-24 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-4xl font-bold text-green-600">{calculateScore()}%</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Quiz Complete!</h2>
                <p className="text-gray-500">
                  {selectedQuiz.title} - {getTimeTaken()} minutes
                </p>
              </div>

              <div className="space-y-3 mb-8">
                {answers.map((answer, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      answer.correct ? "bg-green-50" : "bg-red-50"
                    }`}
                  >
                    <span className="text-gray-600">Question {index + 1}</span>
                    {answer.correct ? (
                      <span className="text-green-600 font-medium">Correct</span>
                    ) : (
                      <span className="text-red-600 font-medium">Incorrect</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleExit}
                  className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                >
                  Back to Quizzes
                </button>
                <button
                  onClick={() => {
                    handleExit();
                  }}
                  className="flex-1 px-6 py-3 bg-[#1B6B7B] text-white rounded-xl font-medium hover:bg-[#155663] transition-colors"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="w-64 bg-[#1B6B7B] text-white flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-bold">iCARE++</h1>
          <p className="text-sm text-white/70">Student Portal</p>
        </div>
        
        <nav className="flex-1 p-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 hover:bg-white/10"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Dashboard
          </button>
          <button
            onClick={() => router.push("/patients")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 hover:bg-white/10"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Patients
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 bg-white/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Quizzes
          </button>
          <button
            onClick={() => router.push("/performance")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 hover:bg-white/10"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Performance
          </button>
        </nav>
        
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-white/70">{user.role}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Adaptive Quizzes</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
              <p className="text-2xl font-bold text-blue-600">Beginner</p>
              <p className="text-sm text-blue-600/70">Start here if you're new</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200">
              <p className="text-2xl font-bold text-yellow-600">Intermediate</p>
              <p className="text-sm text-yellow-600/70">For regular practice</p>
            </div>
            <div className="bg-red-50 p-4 rounded-xl border border-red-200">
              <p className="text-2xl font-bold text-red-600">Advanced</p>
              <p className="text-sm text-red-600/70">Challenge yourself</p>
            </div>
          </div>

          <div className="space-y-4">
            {quizzes.map((quiz) => (
              <div key={quiz.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-1">{quiz.title}</h3>
                    <p className="text-sm text-gray-500 mb-2">{quiz.description}</p>
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-sm rounded">
                        {quiz.category}
                      </span>
                      <span className={`px-2 py-1 text-sm rounded ${
                        quiz.difficulty === 'beginner' ? 'bg-green-100 text-green-700' :
                        quiz.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {quiz.difficulty}
                      </span>
                      <span className="text-sm text-gray-500">
                        {quizQuestions[quiz.id]?.length || 0} questions
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleStartQuiz(quiz)}
                    className="px-6 py-2 bg-[#1B6B7B] text-white rounded-lg hover:bg-[#155663] transition-colors"
                  >
                    Start Quiz
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}