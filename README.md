# KINO

KINO is a mood-based movie recommendation app with a clean sky-blue Y2K interface.
It suggests five movies from a current mood, lets you save titles to a watchlist or watched list,
and opens a detail view with three related picks.

## Features

- Mood-based discovery powered by Groq
- OMDb search and movie metadata lookup
- Five recommendations per discover request
- Three related suggestions in the movie detail view
- Watchlist and watched tracking in localStorage
- Light and dark theme toggle

## Tech Stack

- Frontend: React + Vite
- Backend: Express
- AI: Groq SDK (`groq-sdk`)
- Movie data: OMDb API

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Create your environment file

Copy `.env.example` to `.env` and fill in your keys:

```bash
GROQ_API_KEY=your_groq_key
OMDB_API_KEY=your_omdb_key
PORT=3001
```

### 3) Run the app locally

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Available Scripts

```bash
npm run dev
npm run dev:client
npm run dev:server
npm run build
npm run preview
npm start
```

## API Endpoints

### `POST /api/recommend`

Request body:

```json
{
   "mood": "dreamy",
   "excludeImdbIDs": ["tt1234567"]
}
```

Response:

```json
{
   "movies": []
}
```

Returns up to 5 movies.

### `GET /api/movie/:imdbID`

Response:

```json
{
   "movie": {},
   "related": []
}
```

Returns movie details plus up to 3 related movies.

## Project Structure

```text
server/        Express API
src/           React app
.env.example   Environment template
```

## Notes

- Do not commit `.env` to GitHub.
- If OMDb poster data is missing, KINO shows a generated sky-blue fallback poster.
- The app stores watchlist and watched data in the browser only.
