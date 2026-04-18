# AI Interview Coach

An AI-powered interview simulator that helps candidates practice realistic interviews for `engineering`, `law`, `commerce`, and `medicine`. The app supports both `job` and `internship` interview tracks, speaks questions aloud, captures spoken answers when browser support is available, and generates coaching feedback with category-wise scoring out of 100.

## Overview

This project was built as a lightweight full-stack interview practice tool. The browser handles the user experience and voice interaction, while a Python backend calls an OpenAI model to:

- generate role-aware mock interview questions
- evaluate each answer using a structured rubric
- score technical depth, communication, confidence, and behaviour
- provide targeted suggestions for improvement

If the backend or API key is unavailable, the app falls back to built-in questions and local scoring so the demo still works.

## Features

- Domain selection: engineering, law, commerce, medicine
- Interview type selection: job or internship
- Role-specific interview generation based on the selected position
- Mix of technical, behavioural, and introduction questions
- Voice output using the browser Speech Synthesis API
- Voice answer capture using browser speech recognition where supported
- LLM-based answer scoring and coaching
- Per-question feedback plus an overall performance report
- Graceful fallback mode when the backend is unavailable

## Tech Stack

- Frontend: `HTML`, `CSS`, `JavaScript`
- Backend: `Python`
- AI integration: `OpenAI Responses API`
- Voice features: browser `SpeechSynthesis` and `SpeechRecognition`

## Project Structure

```text
.
|-- app.js
|-- index.html
|-- README.md
|-- server.py
`-- style.css
```

## How It Works

1. The user selects a domain, interview type, and target role.
2. The frontend requests a fresh interview from the Python backend.
3. The backend asks the OpenAI model to generate structured interview questions.
4. The browser presents the questions and can read them aloud.
5. The user responds by typing or speaking.
6. The backend sends each answer to the OpenAI model for structured scoring and coaching.
7. The frontend displays live feedback and a final report.

## Local Setup

### 1. Set your OpenAI API key

In PowerShell:

```powershell
$env:OPENAI_API_KEY="your_api_key_here"
```

Optional model override:

```powershell
$env:OPENAI_MODEL="gpt-5-mini"
```

### 2. Start the local server

```powershell
python server.py
```

### 3. Open the app

Visit:

```text
http://127.0.0.1:8000
```

## Notes

- The API key stays on the server side and is not exposed in browser JavaScript.
- Browser speech recognition support varies by browser and privacy settings.
- If live LLM calls fail, the app falls back to built-in interview questions and simplified local scoring.

## Resume / Portfolio Description

You can describe this project like this:

`Built a full-stack AI interview coach that simulates domain-specific mock interviews with voice interaction, LLM-generated questions, and structured answer scoring across technical depth, communication, confidence, and behaviour.`

## Future Improvements

- Save interview history and transcripts
- Add authentication and user profiles
- Support audio upload and server-side speech-to-text
- Add richer analytics for repeated practice sessions
- Deploy a hosted version with persistent backend storage
