# frontend_chat

Simple React (Vite) frontend for the `bot-brain` FastAPI backend.

This app is the patient chat UI for AyurvedaBot. It supports typed symptom input, browser voice-to-text, and read-aloud playback for assistant/report responses.

Quick start:

1. cd to the folder and install dependencies:

```bash
cd "frontend_chat"
npm install
```

2. Run dev server:

```bash
npm run dev
```

3. Ensure the backend FastAPI server is running at `http://127.0.0.1:8000`.

The frontend expects the patient chat API at `http://127.0.0.1:8000` and uses the browser's Web Speech APIs for speech input/output.

Usage:
- Type your symptoms or issue and press Send. The frontend sends the message to `/ask` and displays the assistant reply.
- Use the microphone button to speak your symptoms instead of typing.
- Use the read-aloud button on assistant responses or report cards to hear the generated review in the browser.
