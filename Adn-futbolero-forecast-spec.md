# ADN Futbolero — AI Soccer Forecast Site
## Full Project Specification for Coding AI

---

## 1. Project Overview

Build a **public web application** that automatically fetches today's soccer matches and generates AI-powered forecasts for each one. The site is the digital home of the Twitter/X account **@ADNFutbolero** and will publish daily picks with reasoning.

### Goals
- Fully automated daily forecast pipeline (no manual input needed)
- AI-generated match analysis using Claude API
- Public-facing website with clean, sport-themed UI
- 100% free infrastructure (no paid services required at launch)

---

## 2. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | **Next.js 14** (App Router) | API routes + SSR + easy Vercel deploy |
| Styling | **Tailwind CSS** | Rapid utility styling |
| Hosting | **Vercel** (free tier) | Serverless functions + cron jobs included |
| Football Data | **football-data.org** (free plan) | Fixtures + standings for 12 competitions |
| AI Forecasts | **Anthropic Claude API** (`claude-sonnet-4-20250514`) | Natural language forecasts |
| Cache/Storage | **Vercel KV** (free tier, 30MB) | Store daily forecasts to avoid re-calling APIs |
| Scheduling | **Vercel Cron** (free tier) | Trigger daily forecast generation at 6 AM UTC |

---

## 3. Environment Variables

Create a `.env.local` file at the project root with the following:

```env
# football-data.org — get free key at https://www.football-data.org/client/register
FOOTBALL_DATA_API_KEY=your_football_data_api_key_here

# Anthropic Claude — get key at https://console.anthropic.com
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Vercel KV — auto-populated by Vercel when you connect a KV store
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Internal secret to protect the cron endpoint
CRON_SECRET=a_random_strong_secret_string
```

> **Important**: Never expose these variables to the client. All API calls must go through Next.js API routes (server-side only).

---

## 4. Project File Structure

```
adn-futbolero/
├── app/
│   ├── layout.tsx               # Root layout with fonts + metadata
│   ├── page.tsx                 # Home page — today's forecasts
│   ├── globals.css              # Tailwind base + custom CSS vars
│   └── api/
│       ├── forecasts/
│       │   └── route.ts         # GET /api/forecasts — returns today's cached forecasts
│       └── cron/
│           └── route.ts         # GET /api/cron — protected, triggers daily generation
├── lib/
│   ├── football.ts              # football-data.org API wrapper
│   ├── claude.ts                # Anthropic Claude API wrapper
│   ├── cache.ts                 # Vercel KV read/write helpers
│   └── types.ts                 # Shared TypeScript types
├── components/
│   ├── ForecastCard.tsx         # Single match forecast card
│   ├── ForecastGrid.tsx         # Grid of all forecast cards
│   ├── Header.tsx               # Site header with branding
│   ├── LoadingState.tsx         # Skeleton loading UI
│   └── EmptyState.tsx           # No matches today message
├── public/
│   └── logo.png                 # ADN Futbolero logo (add your own)
├── vercel.json                  # Cron job config
├── .env.local                   # Local env vars (never commit)
├── .env.example                 # Template for env vars (safe to commit)
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 5. Supported Competitions (Free Tier)

The football-data.org free plan includes these 12 competitions. Use their IDs in API calls:

| ID | Competition |
|---|---|
| `PL` | English Premier League |
| `PD` | Spanish La Liga |
| `BL1` | German Bundesliga |
| `SA` | Italian Serie A |
| `FL1` | French Ligue 1 |
| `CL` | UEFA Champions League |
| `ELC` | English Championship |
| `PPL` | Portuguese Primeira Liga |
| `DED` | Dutch Eredivisie |
| `BSA` | Brazilian Série A |
| `WC` | FIFA World Cup |
| `EC` | UEFA European Championship |

---

## 6. Data Flow & Architecture

```
[Vercel Cron — 6 AM UTC]
        |
        v
[GET /api/cron] — validates CRON_SECRET header
        |
        v
[lib/football.ts]
  → Fetch today's matches from football-data.org
    for each active competition (PL, PD, BL1, SA, FL1, CL)
  → For each competition with matches today:
      → Fetch current standings (league table)
        |
        v
[lib/claude.ts]
  → For each match, call Claude API with:
      - Home team name, away team name
      - Home team: position, points, GF, GA, GD, form (last 5)
      - Away team: same stats
      - Competition name
  → Claude returns structured JSON:
      { prediction, confidence, reasoning, score_suggestion }
        |
        v
[lib/cache.ts]
  → Store all forecasts in Vercel KV under key: forecasts:YYYY-MM-DD
  → TTL: 24 hours
        |
        v
[GET /api/forecasts] — called by the frontend
  → Reads from Vercel KV
  → If cache miss and it's daytime, triggers generation on-demand
  → Returns JSON array of ForecastResult[]
        |
        v
[app/page.tsx]
  → Fetches /api/forecasts on load
  → Renders <ForecastGrid /> with all results
```

---

## 7. TypeScript Types (`lib/types.ts`)

```typescript
export interface TeamStats {
  name: string;
  crest: string; // URL to team crest image
  position: number;
  points: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form: string; // e.g. "WWDLW"
}

export interface Match {
  id: number;
  competition: string;
  competitionCode: string;
  utcDate: string; // ISO date string
  homeTeam: TeamStats;
  awayTeam: TeamStats;
}

export interface ForecastResult {
  matchId: number;
  competition: string;
  competitionCode: string;
  utcDate: string;
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  forecast: {
    prediction: "HOME" | "AWAY" | "DRAW";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    reasoning: string;       // 2-3 sentences in Spanish (for ADN Futbolero audience)
    scoreSuggestion: string; // e.g. "2-1"
    keyFactor: string;       // One-line highlight, e.g. "Home team on 5-game win streak"
  };
  generatedAt: string; // ISO timestamp
}
```

---

## 8. football-data.org API Wrapper (`lib/football.ts`)

```typescript
const BASE_URL = "https://api.football-data.org/v4";
const COMPETITIONS = ["PL", "PD", "BL1", "SA", "FL1", "CL"];

const headers = {
  "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY!,
};

// Returns all matches scheduled for today across all competitions
export async function getTodaysMatches(): Promise<Match[]>

// Returns current standings for a given competition code
export async function getStandings(competitionCode: string): Promise<TeamStats[]>

// Combines matches + standings into enriched Match objects
export async function getEnrichedMatches(): Promise<Match[]>
```

### API Endpoints to Use

```
GET /v4/matches?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
  → Returns all matches on a given date across all competitions in your tier.
  → Filter results to only the COMPETITIONS array above.

GET /v4/competitions/{competitionCode}/standings
  → Returns full league table for a competition.
  → Use to enrich each team with their current stats.
```

### Implementation Notes
- Today's date should be computed server-side in UTC: `new Date().toISOString().split("T")[0]`
- Rate limit is 10 calls/minute on the free plan. Add a `sleep(6000)` between calls when fetching standings for multiple competitions in sequence.
- The `form` field is available in the standings response under `table[n].form` as a string like `"W,W,D,L,W"`. Clean it to `"WWDLW"`.
- Team crests are available at `team.crest` in the matches response.

---

## 9. Claude API Wrapper (`lib/claude.ts`)

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateForecast(match: Match): Promise<ForecastResult["forecast"]>
```

### System Prompt

```
You are a professional soccer analyst for ADN Futbolero, a Spanish-language soccer forecast account. 
Your job is to analyze match data and produce accurate, confident forecasts.

You must respond ONLY with a valid JSON object. No preamble, no explanation, no markdown code blocks.

The JSON must have exactly this structure:
{
  "prediction": "HOME" | "AWAY" | "DRAW",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "2-3 sentences in Spanish explaining the forecast",
  "scoreSuggestion": "X-Y format, e.g. 2-1",
  "keyFactor": "One sentence in Spanish identifying the decisive factor"
}

Confidence rules:
- HIGH: Clear statistical advantage for one side (5+ position gap, strong form differential)
- MEDIUM: Some advantage but match is competitive
- LOW: Very close teams, derby, or cup match with unpredictable nature
```

### User Prompt Template

```
Match: {homeTeam.name} vs {awayTeam.name}
Competition: {competition}
Date: {utcDate}

HOME TEAM — {homeTeam.name}
  League Position: {homeTeam.position}
  Points: {homeTeam.points} in {homeTeam.played} games
  Record: {homeTeam.won}W {homeTeam.draw}D {homeTeam.lost}L
  Goals: {homeTeam.goalsFor} scored, {homeTeam.goalsAgainst} conceded (GD: {homeTeam.goalDifference})
  Recent Form (last 5): {homeTeam.form}

AWAY TEAM — {awayTeam.name}
  League Position: {awayTeam.position}
  Points: {awayTeam.points} in {awayTeam.played} games
  Record: {awayTeam.won}W {awayTeam.draw}D {awayTeam.lost}L
  Goals: {awayTeam.goalsFor} scored, {awayTeam.goalsAgainst} conceded (GD: {awayTeam.goalDifference})
  Recent Form (last 5): {awayTeam.form}

Generate your forecast for this match.
```

### Implementation Notes
- Use model: `claude-sonnet-4-20250514`
- Set `max_tokens: 400` (the JSON response is small)
- Parse the response with `JSON.parse()`. Wrap in try/catch — if parsing fails, return a fallback object with `confidence: "LOW"` and a default reasoning string.
- Do NOT call Claude for multiple matches in parallel. Use sequential calls with `await` to stay within rate limits.

---

## 10. Vercel KV Cache (`lib/cache.ts`)

```typescript
import { kv } from "@vercel/kv";

const CACHE_KEY_PREFIX = "forecasts";
const TTL_SECONDS = 60 * 60 * 24; // 24 hours

export async function getCachedForecasts(date: string): Promise<ForecastResult[] | null>
export async function setCachedForecasts(date: string, data: ForecastResult[]): Promise<void>
```

### Key Format
```
forecasts:2025-04-25   →  ForecastResult[]  (JSON stringified)
```

### Fallback Without KV
If you haven't connected Vercel KV yet (local dev), implement a simple in-memory Map as fallback:
```typescript
const memoryCache = new Map<string, ForecastResult[]>();
```

---

## 11. API Routes

### `GET /api/forecasts` (`app/api/forecasts/route.ts`)

```typescript
// 1. Get today's date (UTC)
// 2. Try to read from Vercel KV cache
// 3. If cache hit → return JSON response
// 4. If cache miss:
//    a. Call getEnrichedMatches() from lib/football.ts
//    b. For each match, call generateForecast() from lib/claude.ts
//    c. Build ForecastResult[] array
//    d. Store in KV with setCachedForecasts()
//    e. Return JSON response
// 5. On any error → return { error: "message", forecasts: [] }

export const revalidate = 0; // Never cache this route at the CDN level
```

### `GET /api/cron` (`app/api/cron/route.ts`)

```typescript
// 1. Validate Authorization header: Bearer {CRON_SECRET}
//    If invalid → return 401
// 2. Run the same pipeline as /api/forecasts
// 3. Force-overwrite cache even if it exists (re-generation)
// 4. Return { success: true, matchCount: N, generatedAt: ISO }

export const dynamic = "force-dynamic";
```

---

## 12. Cron Job Config (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "0 6 * * *"
    }
  ]
}
```

This triggers daily at **6:00 AM UTC**. Vercel automatically sends a request with the `Authorization: Bearer {CRON_SECRET}` header.

> **Note**: Vercel free tier supports 2 cron jobs. This uses 1.

---

## 13. Frontend Components

### `app/page.tsx` — Home Page

```typescript
// This is a Server Component that fetches data at render time.
// It calls /api/forecasts internally via fetch().
// Pass results to <ForecastGrid forecasts={data} />
// Show today's date prominently: "Pronósticos — Sábado 25 de Abril"
// Add a footer with link to @ADNFutbolero on Twitter/X
```

### `components/ForecastCard.tsx`

Each card must display:
- Competition logo/name
- Match time (local time, converted from UTC)
- Home team crest + name
- Away team crest + name
- **Prediction badge**: HOME WIN / EMPATE / AWAY WIN (colored: green/yellow/blue)
- **Confidence chip**: ALTA / MEDIA / BAJA
- **Suggested score**: e.g. `2 - 1`
- **Key factor**: italic one-liner
- **Reasoning**: 2-3 sentence paragraph in Spanish

### `components/ForecastGrid.tsx`

- Responsive grid: 1 column mobile, 2 columns tablet, 3 columns desktop
- Group cards by competition (show competition header between groups)
- If `forecasts.length === 0`: render `<EmptyState />`

### `components/Header.tsx`

- Site title: **ADN Futbolero**
- Tagline: *"Pronósticos con inteligencia artificial"*
- Twitter/X link to @ADNFutbolero
- Today's date

### `components/LoadingState.tsx`

- 6 skeleton cards using `animate-pulse` (Tailwind)

### `components/EmptyState.tsx`

- Icon + message: *"No hay partidos programados para hoy. Vuelve mañana."*

---

## 14. UI Design Guidelines

The site should feel like a **sports broadcast app** — dark, energetic, data-forward. Not a generic blog.

### Color Palette (CSS variables in `globals.css`)

```css
:root {
  --bg-primary: #0a0e1a;        /* Near-black navy */
  --bg-card: #111827;           /* Dark card background */
  --bg-card-hover: #1a2236;
  --border: #1f2937;
  --accent-green: #10b981;      /* HOME WIN */
  --accent-yellow: #f59e0b;     /* DRAW */
  --accent-blue: #3b82f6;       /* AWAY WIN */
  --accent-red: #ef4444;        /* LOW confidence */
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --text-muted: #4b5563;
}
```

### Typography

```
Display font: "Bebas Neue" (Google Fonts) — for scores, team names, section headers
Body font: "DM Sans" (Google Fonts) — for reasoning text, labels
```

### Card Design Details

- Dark card with subtle border (`border: 1px solid var(--border)`)
- Left-side colored bar based on prediction (green/yellow/blue)
- Team crests as `<img>` with 32px size
- Score suggestion displayed large (Bebas Neue, 2.5rem)
- Confidence chip: small rounded badge, color-coded
- Hover state: subtle glow effect matching prediction color
- Mobile: full-width cards stacked vertically

---

## 15. Error Handling Strategy

| Scenario | Behavior |
|---|---|
| football-data.org returns 429 (rate limit) | Retry after 60s, max 3 retries |
| football-data.org returns 403 | Log error, return empty matches array |
| No matches today | Return empty array, show EmptyState |
| Claude API fails for one match | Skip that match's forecast, continue with others |
| Claude returns invalid JSON | Use fallback forecast: `{ prediction: "DRAW", confidence: "LOW", reasoning: "Análisis no disponible en este momento.", scoreSuggestion: "?-?", keyFactor: "-" }` |
| KV cache unavailable | Fall through to live API calls on every request |

---

## 16. Local Development Setup

```bash
# 1. Clone and install
npx create-next-app@latest adn-futbolero --typescript --tailwind --app --src-dir=false --import-alias="@/*"
cd adn-futbolero

# 2. Install dependencies
npm install @anthropic-ai/sdk @vercel/kv

# 3. Add Google Fonts to app/layout.tsx
# Import Bebas Neue + DM Sans from next/font/google

# 4. Set up env vars
cp .env.example .env.local
# Fill in FOOTBALL_DATA_API_KEY and ANTHROPIC_API_KEY

# 5. Run locally
npm run dev

# 6. Test the pipeline manually
curl http://localhost:3000/api/forecasts
```

### Testing the Cron Locally

```bash
curl -H "Authorization: Bearer your_cron_secret" http://localhost:3000/api/cron
```

---

## 17. Vercel Deployment Steps

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "initial"
gh repo create adn-futbolero --public --push

# 2. Import project on vercel.com
# Connect your GitHub repo → Vercel auto-detects Next.js

# 3. Add environment variables in Vercel dashboard:
#    FOOTBALL_DATA_API_KEY, ANTHROPIC_API_KEY, CRON_SECRET

# 4. Create a Vercel KV store:
#    Vercel Dashboard → Storage → Create KV Store → Link to project
#    This auto-populates KV_REST_API_URL and KV_REST_API_TOKEN

# 5. Deploy
git push origin main
# Vercel auto-deploys on every push
```

---

## 18. Rate Limit Budget (Free Tier)

| API | Free Limit | Our Usage | Safe? |
|---|---|---|---|
| football-data.org | 10 req/min | ~8 req/day (6 competitions + 1 matches call) | ✅ Yes |
| Anthropic Claude API | Varies by plan | ~10-15 req/day (one per match) | ✅ Yes |
| Vercel Functions | 100k req/month | ~100 req/day | ✅ Yes |
| Vercel KV | 30MB storage | <1MB | ✅ Yes |
| Vercel Cron | 2 jobs free | 1 job | ✅ Yes |

---

## 19. Future Enhancements (Out of Scope for V1)

- **Historical accuracy tracker**: Store predictions vs actual results, display % accuracy by competition
- **Twitter auto-post**: Use Twitter API v2 to auto-post a daily summary thread from @ADNFutbolero
- **More competitions**: Upgrade football-data.org plan to add Brasileirão, Liga MX, etc.
- **Odds integration**: Add the €15/mo Odds Add-On to improve forecast quality with market data
- **Confidence leaderboard**: Track which competition Claude forecasts most accurately
- **Share card generator**: `/api/og` route using `@vercel/og` to generate Twitter-ready forecast images

---

## 20. Summary Checklist for Coding AI

- [ ] Initialize Next.js 14 project with TypeScript + Tailwind + App Router
- [ ] Install `@anthropic-ai/sdk` and `@vercel/kv`
- [ ] Create `lib/types.ts` with all interfaces
- [ ] Create `lib/football.ts` with `getTodaysMatches`, `getStandings`, `getEnrichedMatches`
- [ ] Create `lib/claude.ts` with `generateForecast` using the system prompt and user prompt template above
- [ ] Create `lib/cache.ts` with KV get/set helpers and in-memory fallback
- [ ] Create `app/api/forecasts/route.ts` with cache-first logic
- [ ] Create `app/api/cron/route.ts` with CRON_SECRET auth
- [ ] Create all 5 components: Header, ForecastCard, ForecastGrid, LoadingState, EmptyState
- [ ] Build `app/page.tsx` as Server Component fetching from /api/forecasts
- [ ] Apply dark sports theme with CSS variables, Bebas Neue + DM Sans fonts
- [ ] Add `vercel.json` with cron config
- [ ] Add `.env.example` template
- [ ] Test locally with `npm run dev`
- [ ] Deploy to Vercel and connect KV store