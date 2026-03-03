# Coast — AI-Native Study Platform

Coast transforms lecture materials into interactive learning experiences. Upload a PDF, get a structured study notebook, practice with matched exam questions, chat with an AI tutor, and watch animated visual explanations — all in one platform.

## Architecture

```
Coast/testing/          ← React frontend (this repo)
Desktop/OCR/            ← Python FastAPI backend (separate repo)
```

### Frontend — React + Vite

| Directory | What it does |
|---|---|
| `src/App.jsx` | Root component, page routing, paper data |
| `src/context/AuthContext.jsx` | JWT auth state, login/logout, token management |
| `src/context/ThemeContext.jsx` | Light/dark mode toggle, persists to localStorage |
| `src/components/Dashboard/` | Main dashboard — daily quest, streak, recent sessions, quick stats, notebook access, Pedro chat launcher |
| `src/components/NotebookPage/` | Notebook list view (sidebar + cards), notebook viewer/editor, PDF upload with SSE progress, flashcard generation, Manim visualizations, Pedro chat panel |
| `src/components/QuestionPage/` | Quiz engine — timed questions, written/MCQ answers, AI grading, progress tracking |
| `src/components/QuestionPage/QuestionIntro.jsx` | Pre-quiz summary/recap screen |
| `src/components/QuestionPage/SessionSummary.jsx` | Post-quiz results — score breakdown, fishing game reward, session stats |
| `src/components/PedroChat/` | Standalone Pedro AI tutor chat (also embedded in notebooks) |
| `src/components/PomodoroPage/` | Pomodoro study timer — focus/short break/long break cycles |
| `src/components/LoginPage/` | Authentication UI — login and registration |
| `src/components/AdminDashboard/` | Admin panel for platform management |
| `src/components/AnimatedRightPanel/` | Animated boat + bird panel on the dashboard |
| `src/components/Navbar.jsx` | Top navigation — page switching, theme toggle, timer access |
| `src/components/Footer.jsx` | Site footer |
| `src/data/` | Sample exam papers and pre-built notebook content (JSON) |
| `src/assets/` | SVGs, Lottie animations, wave backgrounds (light + dark) |
| `public/export.txt` | AI tools and models documentation for showcasing |
| `public/viz/` | Pre-rendered demo visualization GIFs |

### Backend — Python FastAPI

| File | What it does |
|---|---|
| `server.py` | Main FastAPI app — auth, notebook CRUD, quiz sessions, file upload, SSE streaming, paper management |
| `pipeline.py` | Notebook generation pipeline — PDF/image extraction, LLM structuring, section merging, question matching |
| `extractor.py` | OCR and text extraction from PDFs, images, and PowerPoint files |
| `processors.py` | Content processors for cleaning and formatting extracted text |
| `tutor.py` | Pedro AI tutor — Socratic chat, tutor memo management, conversation summarization, note condensation |
| `viz_router.py` | Manim visualization API — Gemini 3.1 Pro script generation, auto-retry with error repair, per-section and full-notebook viz endpoints |
| `database.py` | SQLite models — User, SavedNotebook, QuizSession, SessionAnswer, ChatMessage, TutorMemo, SkillProfile |
| `auth.py` | JWT token creation, verification, password hashing |
| `schema.py` | Pydantic request/response schemas |
| `notebook_schema.py` | Notebook data structure definitions |
| `manim_renderer.py` | Manim rendering utilities |

## AI Models & What They Power

| Feature | Model | Provider |
|---|---|---|
| Manim script generation + auto-repair | Gemini 3.1 Pro | Google |
| Visualization concept picking | GPT-4o-mini | OpenAI |
| Notebook generation from documents | GPT-4o | OpenAI |
| Pedro AI tutor (chat) | GPT-4o / Kimi K2.5 | OpenAI / Moonshot |
| Answer evaluation & grading | GPT-4o-mini | OpenAI |
| Question-to-notebook matching | GPT-4o-mini | OpenAI |
| Tutor memory updates | GPT-4o | OpenAI |
| Chat → study notes condensation | GPT-4o | OpenAI |
| Conversation summarization | GPT-4o | OpenAI |
| Notebook generation (alternative) | Claude Sonnet 4 | Anthropic |

## Tech Stack

- **Frontend**: React 19, Vite 7, Lucide icons, Lottie animations
- **Backend**: Python FastAPI, SQLite, Uvicorn
- **AI APIs**: OpenAI (GPT-4o, GPT-4o-mini), Google Gemini 3.1 Pro, Anthropic Claude, Moonshot Kimi K2.5
- **Visualization**: Manim Community Edition v0.20 (3Blue1Brown's animation engine)
- **Auth**: JWT-based with bcrypt password hashing
- **Real-time**: Server-Sent Events for upload/generation progress
- **UI**: Custom CSS with glassmorphism design, light/dark mode, responsive for desktop

## Setup

### Frontend

```bash
cd Coast/testing
npm install
npm run dev
```

Runs on `http://localhost:5173`

### Backend

```bash
cd OCR
cp .env.example .env        # Fill in your API keys
pip3 install -r requirements.txt
python3 -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

Runs on `http://localhost:8000`

### Required API Keys (in `.env`)

```
OPENAI_API_KEY=...          # Required — GPT-4o, GPT-4o-mini
GEMINI_API_KEY=...          # Required — Gemini 3.1 Pro for visualizations
KIMI_API_KEY=...            # Optional — Kimi K2.5 alternative for Pedro
ANTHROPIC_API_KEY=...       # Optional — Claude alternative for notebooks
```

### Manim (for visualizations)

```bash
brew install py3cairo ffmpeg
pip3 install manim
```
