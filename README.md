# Simple Load Testing (Backend)

NestJS-style backend that:
- accepts a Postman collection JSON upload
- generates a k6 script
- runs k6 with **1000 VUs** (MVP default)
- stores raw artifacts + exposes summary via API

## Prereqs

- Node.js 20+
- k6 installed and available on PATH (`k6 version`)

## Run

```bash
cd backend
npm install
npm run build
npm start
```



Backend listens on `http://localhost:3001`.

## API

- `GET /api/health`
- `POST /api/tests` (multipart form-data: file field `collection`)
- `POST /api/tests/:id/run`
- `GET /api/tests/:id`

Artifacts are written to `backend/storage/tests/<testId>/`.

