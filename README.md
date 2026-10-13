# Programa Acordes y Letras - Proyecto App virtual

This project contains an Angular frontend and a Python FastAPI backend, with the existing HTML/CSS/JS from the "Prueba" folder integrated.

## Frontend (Angular)

Located in the `client` directory.

### Prerequisites
- Node.js (v22+)
- npm (v10+)

### Setup
```bash
cd client
npm install
```

### Development
Run the Angular development server (proxy configured to forward `/api` requests to the backend):
```bash
ng serve
```
The app will be available at `http://localhost:4200`.
API calls to `/api` are proxied to `http://localhost:8000`.

### Build
```bash
ng build
```
The build artifacts will be in `dist/client/browser/`.

## Backend (Python FastAPI)

Located in the `server` directory.

### Prerequisites
- Python 3.13+

### Setup
```bash
cd server
# Create virtual environment (if not already created)
python -m venv venv
# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Unix/macOS:
source venv/bin/activate
pip install -r requirements.txt
```

### Development
Run the FastAPI server:
```bash
uvicorn main:app --reload
```
The API will be available at `http://localhost:8000`.

### API Endpoints
- `GET /api/hello` returns a greeting message.

## Running Both
1. Start the backend: `uvicorn main:app --reload` (inside `server` with venv activated)
2. Start the frontend: `ng serve` (inside `client`)

## Integrated Files
The following files from `C:\Users\Juanito\Documents\Programa Acordes y Letras\Prueba` have been integrated:
- `index.html` → Structure and UI elements placed in `client/src/app/app.html`
- `styles.css` → Converted to SCSS and included as global styles (`client/src/styles.scss`)
- `script.js` → Copied to `client/src/assets/js/script.js` and loaded dynamically by the Angular app

The Angular app uses a proxy configuration (`proxy.conf.json`) to forward `/api` requests to the Python backend during development.

Enjoy developing your Acordes y Letras application!
