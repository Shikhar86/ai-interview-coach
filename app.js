const fallbackQuestionBanks = {
  engineering: {
    technical: [
      "Walk me through a challenging technical problem you solved recently and explain how you approached debugging it.",
      "How would you design a reliable and scalable system for a feature used by thousands of users every day?",
      "What factors do you consider before choosing a data structure or algorithm for a production feature?",
      "Tell me how you ensure code quality before shipping a feature.",
    ],
  },
  law: {
    technical: [
      "Describe how you would approach legal research for a matter where the facts are still evolving.",
      "How would you identify risk while reviewing a commercial contract for a client?",
      "Explain how you would prepare for a client meeting involving a potential regulatory issue.",
      "What makes a legal argument persuasive in a professional setting?",
    ],
  },
  commerce: {
    technical: [
      "How would you analyze whether a business unit is financially healthy?",
      "Tell me how you would evaluate a market opportunity before recommending an expansion.",
      "What metrics would you track to understand the performance of a product or business function?",
      "Describe a time when you had to make a recommendation using incomplete commercial data.",
    ],
  },
  medicine: {
    technical: [
      "How would you approach assessing a patient when the presenting symptoms are broad and non-specific?",
      "Tell me how you balance evidence-based care with empathy and reassurance for anxious patients.",
      "Describe how you would respond if you suspected a safety issue in a clinical setting.",
      "What does strong teamwork look like in a high-pressure medical environment?",
    ],
  },
};

const fallbackBehaviouralQuestions = [
  "Tell me about yourself and why this opportunity is a strong fit for you.",
  "Describe a time you handled pressure, uncertainty, or a setback. What did you learn from it?",
  "How do you work with people who disagree with your ideas or working style?",
  "What is one weakness you are actively improving, and what are you doing about it?",
];

const ui = {
  setupForm: document.getElementById("setup-form"),
  domain: document.getElementById("domain"),
  track: document.getElementById("track"),
  position: document.getElementById("position"),
  candidateName: document.getElementById("candidate-name"),
  voiceEnabled: document.getElementById("voice-enabled"),
  speechEnabled: document.getElementById("speech-enabled"),
  compatibilityNote: document.getElementById("compatibility-note"),
  sessionStage: document.getElementById("session-stage"),
  questionCount: document.getElementById("question-count"),
  liveScore: document.getElementById("live-score"),
  questionType: document.getElementById("question-type"),
  questionText: document.getElementById("question-text"),
  questionMeta: document.getElementById("question-meta"),
  voiceStatus: document.getElementById("voice-status"),
  speakQuestionBtn: document.getElementById("speak-question-btn"),
  startAnswerBtn: document.getElementById("start-answer-btn"),
  stopAnswerBtn: document.getElementById("stop-answer-btn"),
  submitAnswerBtn: document.getElementById("submit-answer-btn"),
  skipQuestionBtn: document.getElementById("skip-question-btn"),
  restartBtn: document.getElementById("restart-btn"),
  answerBox: document.getElementById("answer-box"),
  feedbackPreview: document.getElementById("feedback-preview"),
  overallScore: document.getElementById("overall-score"),
  technicalScore: document.getElementById("technical-score"),
  communicationScore: document.getElementById("communication-score"),
  confidenceScore: document.getElementById("confidence-score"),
  behaviourScore: document.getElementById("behaviour-score"),
  strengthsList: document.getElementById("strengths-list"),
  improvementsList: document.getElementById("improvements-list"),
  roundNotes: document.getElementById("round-notes"),
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synthesisSupported = "speechSynthesis" in window;
const recognitionSupported = Boolean(SpeechRecognition);

let recognition = null;
let interviewState = createEmptyState();

function createEmptyState() {
  return {
    config: null,
    questions: [],
    currentIndex: -1,
    answers: [],
    liveScores: [],
    listening: false,
    complete: false,
    backendMode: "unknown",
    isBusy: false,
  };
}

function initRecognition() {
  if (!recognitionSupported) return;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let transcript = "";

    for (let index = 0; index < event.results.length; index += 1) {
      transcript += event.results[index][0].transcript;
      transcript += event.results[index].isFinal ? " " : "";
    }

    ui.answerBox.value = transcript.trim();
  };

  recognition.onstart = () => {
    interviewState.listening = true;
    syncControls();
    ui.voiceStatus.textContent = "Microphone is live. Start speaking and your answer will appear in the answer box.";
    ui.feedbackPreview.innerHTML = '<span class="pill">Listening...</span> Speak naturally and your answer will be transcribed here.';
  };

  recognition.onend = () => {
    interviewState.listening = false;
    syncControls();
    ui.voiceStatus.textContent = "Voice capture stopped. You can review the transcript, continue by voice, or submit your answer.";
  };

  recognition.onerror = (event) => {
    interviewState.listening = false;
    syncControls();
    ui.voiceStatus.textContent = `Voice input error: ${event.error}. You can type your answer instead or retry the microphone.`;
    ui.feedbackPreview.textContent = `Speech recognition error: ${event.error}. You can still type your answer manually.`;
  };
}

async function apiRequest(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Backend request failed.");
  }

  return data;
}

function buildFallbackInterview(config) {
  const technical = fallbackQuestionBanks[config.domain].technical.map((question) => ({
    category: "Technical",
    question,
  }));

  const behavioural = fallbackBehaviouralQuestions.map((question) => ({
    category: "Behavioural",
    question,
  }));

  return [
    {
      category: "Introduction",
      question: `Welcome${config.candidateName ? ` ${config.candidateName}` : ""}. For this ${config.track} interview for the role of ${config.position}, please introduce yourself and explain why you are interested in this opportunity.`,
    },
    ...technical.slice(0, 3),
    ...behavioural.slice(0, 4),
  ];
}

async function startInterview(config) {
  interviewState = createEmptyState();
  interviewState.config = config;
  interviewState.isBusy = true;
  syncControls();
  ui.feedbackPreview.innerHTML = '<span class="pill">Preparing...</span> Building your interview with the backend coach.';

  try {
    const data = await apiRequest("/api/interview", config);
    interviewState.questions = data.questions;
    interviewState.backendMode = data.mode || "llm";
    ui.compatibilityNote.textContent = data.message || "LLM backend is connected.";
  } catch (error) {
    interviewState.questions = buildFallbackInterview(config);
    interviewState.backendMode = "fallback";
    ui.compatibilityNote.textContent = `Backend unavailable: ${error.message} Using built-in questions and scoring instead.`;
  }

  interviewState.currentIndex = 0;
  interviewState.isBusy = false;
  updateQuestionCard();
  syncControls();
  ui.voiceStatus.textContent = recognitionSupported
    ? "Your interview is ready. Press Start Voice Answer to reply aloud."
    : "This browser does not support voice answering here, so please type your answer.";
  ui.feedbackPreview.innerHTML = `Interview created for <strong>${escapeHtml(config.position)}</strong>. Mode: <strong>${escapeHtml(interviewState.backendMode.toUpperCase())}</strong>. Start answering when you're ready.`;
  speakCurrentQuestion();
}

function updateQuestionCard() {
  const question = interviewState.questions[interviewState.currentIndex];
  const total = interviewState.questions.length;

  ui.sessionStage.textContent = interviewState.complete
    ? "Interview complete"
    : interviewState.currentIndex >= 0
      ? `${question.category} Round`
      : "Waiting to start";
  ui.questionCount.textContent =
    interviewState.currentIndex >= 0 ? `${interviewState.currentIndex + 1} / ${total}` : `0 / ${total}`;
  ui.liveScore.textContent = interviewState.liveScores.length
    ? Math.round(average(interviewState.liveScores)).toString()
    : "--";

  if (!question) return;

  ui.questionType.textContent = `${question.category} Question`;
  ui.questionText.textContent = question.question;
  ui.questionMeta.textContent = `Target role: ${interviewState.config.position} | Domain: ${capitalize(interviewState.config.domain)} | Track: ${capitalize(interviewState.config.track)} | Mode: ${interviewState.backendMode.toUpperCase()}`;
}

function speakCurrentQuestion() {
  const question = interviewState.questions[interviewState.currentIndex];

  if (!question || !ui.voiceEnabled.checked || !synthesisSupported) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(question.question);
  utterance.rate = 0.97;
  utterance.pitch = 1;
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}

function startListening() {
  if (!recognition || !ui.speechEnabled.checked) {
    ui.voiceStatus.textContent = "Voice answering is unavailable right now. Make sure Voice Input is enabled and your browser supports speech recognition.";
    ui.feedbackPreview.textContent = "Speech recognition is unavailable here. You can type your answer instead.";
    return;
  }

  try {
    ui.answerBox.value = "";
    recognition.start();
  } catch (error) {
    ui.voiceStatus.textContent = "Could not start the microphone. Check browser microphone permission and try again.";
    ui.feedbackPreview.textContent = "Could not start speech recognition. Please type your answer manually.";
  }
}

function stopListening() {
  if (!recognition || !interviewState.listening) return;
  recognition.stop();
}

async function submitAnswer(skipped = false) {
  const question = interviewState.questions[interviewState.currentIndex];
  if (!question) return;

  stopListening();
  const answerText = skipped ? "" : ui.answerBox.value.trim();
  interviewState.isBusy = true;
  syncControls();
  ui.feedbackPreview.innerHTML = '<span class="pill">Scoring...</span> The coach is reviewing this answer.';

  try {
    const evaluation = interviewState.backendMode === "llm"
      ? await scoreAnswerWithBackend(question, answerText, skipped)
      : scoreAnswerFallback(question, answerText, skipped);

    interviewState.answers.push({
      question,
      answer: answerText,
      skipped,
      evaluation,
    });

    interviewState.liveScores.push(evaluation.total);
    ui.feedbackPreview.innerHTML = renderFeedbackPreview(evaluation, skipped);
    ui.answerBox.value = "";

    if (interviewState.currentIndex === interviewState.questions.length - 1) {
      finishInterview();
      return;
    }

    interviewState.currentIndex += 1;
    updateQuestionCard();
    speakCurrentQuestion();
  } catch (error) {
    ui.feedbackPreview.textContent = `Scoring failed: ${error.message}`;
  } finally {
    interviewState.isBusy = false;
    syncControls();
  }
}

async function scoreAnswerWithBackend(question, answer, skipped) {
  const data = await apiRequest("/api/evaluate", {
    config: interviewState.config,
    question,
    answer,
    skipped,
    history: interviewState.answers.map((item) => ({
      category: item.question.category,
      question: item.question.question,
      answer: item.answer,
      total: item.evaluation.total,
    })),
  });

  return data.evaluation;
}

function scoreAnswerFallback(question, answerText, skipped) {
  if (skipped || !answerText) {
    return {
      total: 12,
      technical: 8,
      communication: 14,
      confidence: 12,
      behaviour: 14,
      strengths: [],
      improvements: [
        "Give a complete response instead of skipping the question.",
        "Use a structured format such as Situation, Action, Result, and Learning.",
        "Speak long enough to show reasoning, confidence, and judgment.",
      ],
      summary: "This response was too brief to evaluate meaningfully.",
    };
  }

  const lower = answerText.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const confidenceHits = countMatches(lower, ["led", "improved", "owned", "delivered", "learned", "resolved"]);
  const structureHits = countMatches(lower, ["first", "because", "result", "outcome", "therefore"]);
  const collaborationHits = countMatches(lower, ["team", "feedback", "listen", "support", "collaborate"]);
  const total = Math.max(35, Math.min(92, Math.round(35 + wordCount * 0.35 + confidenceHits * 5 + structureHits * 4 + collaborationHits * 3)));

  return {
    total,
    technical: question.category === "Technical" ? Math.min(95, total + 4) : Math.max(40, total - 4),
    communication: Math.min(95, total + 2),
    confidence: Math.max(35, Math.min(95, total - 1 + confidenceHits * 4)),
    behaviour: Math.max(35, Math.min(95, total - 2 + collaborationHits * 5)),
    strengths: [
      "You provided enough substance for the coach to evaluate your thinking.",
      "Your answer shows at least some ownership and direction.",
    ],
    improvements: [
      "Increase role-specific detail so your answer feels less generic.",
      "End with a clearer outcome or takeaway.",
    ],
    summary: `Fallback scoring mode assessed this as a developing answer with ${wordCount} words.`,
  };
}

function finishInterview() {
  interviewState.complete = true;
  interviewState.currentIndex = interviewState.questions.length - 1;
  updateQuestionCard();
  syncControls();
  renderFinalReport();
  ui.sessionStage.textContent = "Interview complete";
  ui.feedbackPreview.innerHTML = '<span class="pill">Session complete</span> Review your coaching report on the right and restart if you want another round.';
}

function renderFinalReport() {
  const evaluations = interviewState.answers.map((item) => item.evaluation);

  ui.overallScore.textContent = Math.round(average(evaluations.map((item) => item.total)));
  ui.technicalScore.textContent = Math.round(average(evaluations.map((item) => item.technical)));
  ui.communicationScore.textContent = Math.round(average(evaluations.map((item) => item.communication)));
  ui.confidenceScore.textContent = Math.round(average(evaluations.map((item) => item.confidence)));
  ui.behaviourScore.textContent = Math.round(average(evaluations.map((item) => item.behaviour)));

  const strengths = collectTopNotes("strengths");
  const improvements = collectTopNotes("improvements");

  ui.strengthsList.innerHTML = strengths.length
    ? strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Complete an interview to generate strengths.</li>";

  ui.improvementsList.innerHTML = improvements.length
    ? improvements.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Complete an interview to generate improvement suggestions.</li>";

  ui.roundNotes.innerHTML = interviewState.answers
    .map((entry, index) => `
      <div class="round-item">
        <div class="round-title">${index + 1}. ${escapeHtml(entry.question.category)} - ${escapeHtml(entry.question.question)}</div>
        <div class="round-score">Score: ${entry.evaluation.total}/100</div>
        <div>${escapeHtml(entry.evaluation.summary)}</div>
      </div>
    `)
    .join("");
}

function collectTopNotes(key) {
  const frequency = new Map();

  interviewState.answers.forEach((entry) => {
    (entry.evaluation[key] || []).forEach((note) => {
      frequency.set(note, (frequency.get(note) || 0) + 1);
    });
  });

  return [...frequency.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([note]) => note);
}

function renderFeedbackPreview(evaluation, skipped) {
  if (skipped) {
    return "<strong>Question skipped.</strong> The coach marked this round low because it did not have enough content to assess.";
  }

  const strengths = (evaluation.strengths || []).length
    ? evaluation.strengths.map(escapeHtml).join(" ")
    : "The answer had enough content to score, but it still needs more polish.";
  const improvements = (evaluation.improvements || []).length
    ? evaluation.improvements.map(escapeHtml).join(" ")
    : "Maintain this quality throughout the rest of the interview.";

  return `
    <strong>Question score: ${evaluation.total}/100</strong><br />
    ${escapeHtml(evaluation.summary)}<br /><br />
    <strong>What worked:</strong> ${strengths}<br /><br />
    <strong>Improve next:</strong> ${improvements}
  `;
}

function syncControls() {
  const active = interviewState.currentIndex >= 0 && !interviewState.complete;
  const locked = interviewState.isBusy;

  ui.speakQuestionBtn.disabled = !active || locked;
  ui.startAnswerBtn.disabled = !active || locked || !ui.speechEnabled.checked || !recognitionSupported || interviewState.listening;
  ui.stopAnswerBtn.disabled = !active || locked || !interviewState.listening;
  ui.submitAnswerBtn.disabled = !active || locked;
  ui.skipQuestionBtn.disabled = !active || locked;
}

function updateCompatibilityNote() {
  const messages = [];

  messages.push(synthesisSupported
    ? "Voice output is supported in this browser."
    : "Voice output is not available here, but the interview still works.");

  if (recognitionSupported) {
    messages.push("Speech recognition is available for spoken answers.");
    ui.voiceStatus.textContent = "Voice answering is available. Generate an interview, then press Start Voice Answer.";
  } else {
    messages.push("Speech recognition is not available here, so answers must be typed.");
    ui.speechEnabled.checked = false;
    ui.voiceStatus.textContent = "Voice answering is not supported in this browser. Typed answers will still work.";
  }

  messages.push("Run the local Python server with an OpenAI API key to enable LLM question generation and scoring.");
  ui.compatibilityNote.textContent = messages.join(" ");
}

function countMatches(text, keywords) {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

ui.setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const config = {
    domain: ui.domain.value,
    track: ui.track.value,
    position: ui.position.value.trim(),
    candidateName: ui.candidateName.value.trim(),
  };

  await startInterview(config);
});

ui.speakQuestionBtn.addEventListener("click", speakCurrentQuestion);
ui.startAnswerBtn.addEventListener("click", startListening);
ui.stopAnswerBtn.addEventListener("click", stopListening);
ui.submitAnswerBtn.addEventListener("click", () => submitAnswer(false));
ui.skipQuestionBtn.addEventListener("click", () => submitAnswer(true));
ui.restartBtn.addEventListener("click", () => {
  window.speechSynthesis.cancel();
  stopListening();
  interviewState = createEmptyState();
  ui.answerBox.value = "";
  ui.sessionStage.textContent = "Waiting to start";
  ui.questionCount.textContent = "0 / 0";
  ui.liveScore.textContent = "--";
  ui.questionType.textContent = "No interview loaded";
  ui.questionText.textContent = "Choose your domain and role, then generate an interview.";
  ui.questionMeta.textContent = "Technical and behavioural questions will adapt to the selected domain and position.";
  ui.voiceStatus.textContent = recognitionSupported
    ? "Generate an interview, then press Start Voice Answer and allow microphone access."
    : "Voice answering is not supported in this browser. Typed answers will still work.";
  ui.feedbackPreview.textContent = "Submit an answer to see per-question coaching.";
  ui.overallScore.textContent = "0";
  ui.technicalScore.textContent = "0";
  ui.communicationScore.textContent = "0";
  ui.confidenceScore.textContent = "0";
  ui.behaviourScore.textContent = "0";
  ui.strengthsList.innerHTML = "<li>Complete an interview to generate strengths.</li>";
  ui.improvementsList.innerHTML = "<li>Coaching suggestions will appear here after the session.</li>";
  ui.roundNotes.textContent = "No answers evaluated yet.";
  syncControls();
});

updateCompatibilityNote();
initRecognition();
syncControls();
