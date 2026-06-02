# AyurCare AI Monorepo

This repository contains three main parts of the AyurCare platform:

- `ayurveda-app/bot-brain`: Python AI backend (FastAPI + Gemini + MongoDB)
- `ayurveda-app/frontend_chat`: Patient-facing frontend (React + Vite)
- `doctor-portal`: Doctor-facing frontend (React + Vite) and Node backend

The patient chat now includes browser-native voice input and read-aloud support. The backend remains text-in/text-out; speech is handled in the frontend with Web Speech APIs.

## Repository Structure

```text
aivedabot/
  ayurveda-app/
    bot-brain/
    frontend_chat/
  doctor-portal/
    server/
    src/
```

## Prerequisites

- Node.js 18+
- npm
- Python 3.10+
- MongoDB (local or Atlas)
- Gemini API key

## Environment Setup

Set up `.env` files in each service directory where needed.

Common variables used by `bot-brain` include:

- `GEMINI_API_KEY`
- `MONGODB_URI`
- `JWT_SECRET` (optional; has a default fallback)
- `model` (optional model override)

For `doctor-portal` and `frontend_chat`, configure API base URLs and auth settings as expected by each app.

## Run Locally

Start each service in its own terminal.

### 1. AI Backend (bot-brain)

```bash
cd ayurveda-app/bot-brain
pip install -r requirements.txt
python api_server.py
```

Default local API host from code: `127.0.0.1:8000`.

The backend endpoint used by the patient chat is `POST /ask`, with supporting session and report routes under `/api/chat/*`.

### 2. Doctor Backend (Node API)

```bash
cd doctor-portal/server
npm install
npm start
```

### 3. Doctor Frontend

```bash
cd doctor-portal
npm install
npm run dev
```

### 4. Patient Frontend

```bash
cd ayurveda-app/frontend_chat
npm install
npm run dev
```

The patient chat supports typing or speaking symptoms, and assistant/report responses can be read aloud in the browser.

## Build Commands

```bash
# Doctor frontend
cd doctor-portal
npm run build

# Patient frontend
cd ayurveda-app/frontend_chat
npm run build
```

## Notes

- The repo includes project-specific README files:
  - `doctor-portal/README.md`
  - `ayurveda-app/frontend_chat/README.md`
- If you change APIs, keep frontend base URLs in sync.
- In this environment, Vite build can fail with `spawn EPERM`; this is a local permission/runtime issue, not necessarily an app code issue.
- The doctor portal README exists but is currently empty.
