# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend (Angular)
- **Install dependencies**: `cd client && npm install`
- **Start development server**: `cd client && ng serve`  
  (The app proxies `/api` requests to the backend at `http://localhost:8000`)
- **Build for production**: `cd client && ng build`
- **Run unit tests**: `cd client && ng test`
- **Run linting/formatting**: Although no explicit lint script is present, you can run Prettier via `npx prettier --write .` or use editor integration.

### Backend (Python FastAPI)
- **Setup virtual environment** (if not already done):
  ```bash
  cd server
  python -m venv venv
  # Activate:
  # Windows: venv\Scripts\activate
  # Unix/macOS: source venv/bin/activate
  pip install -r requirements.txt
  ```
- **Start development server**: `cd server && uvicorn main:app --reload` (requires venv activated)
- **Run tests**: `cd server && pytest` (if tests have been added)

### Running Full Stack
1. Start the backend: `uvicorn main:app --reload` (inside `server` with venv activated)
2. Start the frontend: `ng serve` (inside `client`)

## Code Architecture

### Frontend (client/)
- **Angular application** with SCSS styling.
- **Core** (`client/src/app/core/`): Contains services and utilities used across the app (e.g., `metronome.service.ts`).
- **Features** (`client/src/app/features/`): Feature modules, each encapsulating a UI section (e.g., metronome page).
- **Layout** (`client/src/app/layout/`): Layout components (e.g., menu component).
- **Assets**: Static assets (images, JavaScript) under `client/src/assets/`.
- **Global styles**: `client/src/styles.scss` (imported from converted `styles.css`).
- **Integrated scripts**: `client/src/assets/js/script.js` (copied from original `script.js`).
- **Proxy configuration**: `client/proxy.conf.json` forwards `/api` requests to the backend during development.

### Backend (server/)
- **FastAPI application** defined in `server/main.py`.
- **Data models**: `server/models.py` (SQLAlchemy models).
- **Database utilities**: `server/database.py` (engine, session handling).
- **SQLite database**: `server/songs.db` (used for development).
- **File uploads**: `server/audio_uploads/` directory for uploaded audio files.
- **API prefix**: All API endpoints are prefixed with `/api` (as configured in the frontend proxy).

### Key Integration Points
- The frontend communicates with the backend via HTTP calls to `/api` endpoints.
- During development, the Angular dev server proxies `/api` to `http://localhost:8000` (backend).
- Production builds serve the Angular static files; the backend can be deployed separately or alongside.

## Notes
- The project uses Angular v22+ and Python 3.13+.
- Ensure virtual environment is activated for backend commands.
- The backend currently includes a basic `/api/hello` endpoint for testing.