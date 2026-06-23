# LIC-Doc - Insurance Advisory Customer Database

A full-stack customer database application for insurance advisory teams.

## Tech Stack
- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** SQLite
- **File Storage:** Local filesystem (`backend/uploads`)

## Features
- Customer form with:
  - Name, date of birth, contact information
  - Family details (spouse, children)
  - Blood relation details
  - Height, weight
  - Insurance policy details
  - Photo upload
  - Multiple document uploads (PDFs/images)
- Customer management:
  - Create, view, search/filter, edit, delete
  - Detailed customer view with policy/photo/documents
- Document management:
  - Upload multiple files per customer
  - View/download files
  - Remove individual documents
- Dashboard:
  - Total customer count
  - Recently added customers

## Project Structure
```
/backend   # Express API, SQLite, file upload handling
/frontend  # React UI
```

## Local Development
### 1) Install dependencies
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2) Run backend
```bash
cd backend
npm run dev
```
Backend runs on `http://localhost:4000`.

### 3) Run frontend
```bash
cd frontend
npm run dev
```
Frontend runs on `http://localhost:5173` and connects to backend at `http://localhost:4000/api` by default.

Optional frontend API override:
```bash
# frontend/.env
VITE_API_URL=http://localhost:4000/api
```

## Production Build
```bash
cd frontend && npm run build
cd ../backend && npm start
```

## API Summary
- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/customers?search=...`
- `GET /api/customers/:id`
- `POST /api/customers` (multipart form-data)
- `PUT /api/customers/:id` (multipart form-data)
- `DELETE /api/customers/:id`
- `DELETE /api/customers/:id/documents/:docId`

## Notes
- Authentication is intentionally omitted (single-user mode).
- SQLite DB file is created at `backend/data.sqlite`.
- Uploads are stored in `backend/uploads/photos` and `backend/uploads/documents`.
