# Victoria's Personal Dashboard — Claude Code Build Spec

> **What:** Personal task management dashboard for a freelance product designer who manages errands, client work, and athletic training.
>
> **Aesthetic:** Apple Notes × Notion × Luma (lu.ma) — white cards on a cool flat gray canvas. Restrained, refined, minimal. Premium tool, not a toy.
>
> **Key insight:** Google Calendar is the single source of truth. Dashboard PULLS scheduled events (runs, meetings, appointments) and displays them as actionable tasks. Manual task creation is for one-offs only.

---

## Table of Contents

1. Tech Stack
2. Directory Structure
3. Database Schema
4. Design System (Luma-matched)
5. Task Data Model
6. Core Behaviors (8 rules)
7. Views & Layout
8. Component Specs
9. API Routes
10. Google Calendar Integration
11. Notion Integration (two-way sync)
12. Animations
13. Environment Variables
14. Implementation Order

---

## 1. Tech Stack

```
Framework:        Next.js 14+ (App Router)
Language:         TypeScript (strict)
Styling:          Tailwind CSS v4 + shadcn/ui
Database:         Supabase (Postgres + Auth + Realtime)
Auth:             Supabase Auth → Google OAuth (same accounts as Calendar)
Calendar:         Google Calendar API (3 accounts, read-only pull)
Email:            Gmail API (read-only, priority inbox)
Weather:          OpenWeatherMap API (free tier, Kraków default)
AI Summary:       Anthropic Claude API (claude-sonnet-4-20250514)
Notion:           @notionhq/client (two-way task sync)
Deployment:       Vercel
Font:             DM Sans (Google Fonts, self-host woff2)
Icons:            Lucide React
Drag & Drop:      @dnd-kit/core + @dnd-kit/sortable
Animations:       Framer Motion
State:            Zustand (lightweight global store)
```

---

## 2. Directory Structure

```
├── app/
│   ├── layout.tsx                  # Root: font, providers, bg color
│   ├── page.tsx                    # Dashboard (protected)
│   ├── login/page.tsx              # Google OAuth
│   ├── api/
│   │   ├── calendar/route.ts       # Google Calendar proxy
│   │   ├── emails/route.ts         # Gmail priority proxy
│   │   ├── weather/route.ts        # OpenWeatherMap proxy
│   │   ├── summary/route.ts        # Claude AI summary
│   │   └── notion/
│   │       ├── sync/route.ts       # Two-way Notion sync (POST)
│   │       └── webhook/route.ts    # Notion webhook receiver (future)
│
├── components/
│   ├── dashboard/
│   │   ├── Header.tsx              # Sticky: title, date, toggle
│   │   ├── SummaryCard.tsx         # AI brief + weather widget
│   │   ├── EmailCard.tsx           # Priority inbox bento card
│   │   ├── BentoCard.tsx           # Category card (Personal/Work/Sport)
│   │   ├── TaskItem.tsx            # Task row: checkbox + content
│   │   ├── TaskDetailPanel.tsx     # Right slide-out with full task info
│   │   ├── ProgressRing.tsx        # SVG donut (sport goals)
│   │   ├── WeatherWidget.tsx       # iOS-style weather SVGs
│   │   ├── AddTaskModal.tsx        # Floating new task form
│   │   ├── MonthView.tsx           # Calendar grid
│   │   └── WeekStrip.tsx           # Horizontal day selector
│   └── ui/                         # shadcn/ui primitives
│
├── lib/
│   ├── supabase.ts                 # Client + server config
│   ├── types.ts                    # All TypeScript interfaces
│   ├── constants.ts                # Categories, subtypes, keywords
│   ├── helpers.ts                  # Date utils, urgency scoring
│   ├── store.ts                    # Zustand store
│   └── hooks/
│       ├── useTasks.ts             # CRUD + realtime
│       ├── useCalendarEvents.ts    # Google Calendar fetch
│       ├── useEmails.ts            # Gmail fetch
│       ├── useWeather.ts           # Weather fetch
│       ├── useDragReorder.ts      # dnd-kit reorder logic
│       └── useNotionSync.ts       # Two-way Notion sync
│
├── public/fonts/                   # DM Sans woff2
└── supabase/migrations/            # SQL schema
```

---

## 3. Database Schema

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT,
  default_location TEXT DEFAULT 'Kraków, Poland',
  weekly_run_goal_km NUMERIC(5,1) DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('personal','work','sport')),
  subtype TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  priority INTEGER DEFAULT 2 CHECK (priority IN (1,2,3)),
  deadline TIMESTAMPTZ,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  done BOOLEAN DEFAULT false,
  done_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  distance_km NUMERIC(5,2),            -- Run tasks: actual km
  calendar_event_id TEXT UNIQUE,        -- Google Calendar event ID
  notion_page_id TEXT UNIQUE,           -- Notion database page ID
  notion_last_synced TIMESTAMPTZ,       -- Last sync timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_user_date ON tasks(user_id, date);
CREATE INDEX idx_tasks_done ON tasks(user_id, done);
CREATE INDEX idx_tasks_cal ON tasks(calendar_event_id);
CREATE INDEX idx_tasks_notion ON tasks(notion_page_id);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_tasks" ON tasks FOR ALL USING (auth.uid() = user_id);

CREATE TABLE preferences (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  card_order TEXT[] DEFAULT ARRAY['personal','work','sport'],
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_prefs" ON preferences FOR ALL USING (auth.uid() = user_id);
```

---

## 4. Design System

### Background — Luma-style

Based directly on lu.ma's Calendars page screenshot. The background is a flat, cool, barely-tinted gray. No heavy gradient — just a whisper of blue.

```css
/* EXACT match to Luma */
body {
  background-color: #F2F3F5;
}

/* Optional: barely perceptible gradient for subtle depth */
body {
  background: linear-gradient(180deg, #F0F1F4 0%, #F3F4F6 100%);
}
```

Do NOT use dark gradients, purple tints, or heavy mesh gradients. The background should feel like paper — neutral, quiet, and invisible.

### Color Palette

```typescript
const colors = {
  // Canvas
  canvas:         '#F2F3F5',        // Luma bg — cool flat gray
  surface:        '#FFFFFF',        // Cards
  surfaceHover:   '#FAFBFC',        // Subtle hover
  
  // Borders (Luma uses very thin, light borders)
  borderCard:     '#E8E9EB',        // Card outlines
  borderSubtle:   '#F0F0F2',        // Task dividers inside cards
  borderInput:    '#DCDEE2',        // Form inputs
  
  // Text
  textPrimary:    '#1A1B1E',        // Headings
  textSecondary:  '#3D3E42',        // Body
  textMuted:      '#8C8F96',        // Labels, metadata
  textDisabled:   '#C5C7CC',        // Placeholders, empty states
  
  // Category Accents
  personal: {
    accent:  '#E69500',   bg: '#FFFCF0',   border: '#FDE68A',
  },
  work: {
    accent:  '#4F46E5',   bg: '#F5F3FF',   border: '#C7D2FE',
  },
  sport: {
    accent:  '#059669',   bg: '#F0FDF9',   border: '#A7F3D0',
  },
  
  // Priority
  high:    { color: '#DC2626', bg: '#FEF2F2' },
  medium:  { color: '#D97706', bg: '#FFFBEB' },
  low:     { color: '#9CA3AF', bg: '#F9FAFB' },
  
  // UI
  black:      '#1A1B1E',       // FAB, today pill
  success:    '#10B981',       // Checkmarks
};
```

### Typography

```
Font:     'DM Sans', -apple-system, sans-serif
Weights:  400 (body) · 500 (tasks) · 600 (labels/buttons) · 700 (headings) · 800 (page title)

Scale:
  9px   — micro labels
  10px  — uppercase captions, metadata
  11px  — sub-labels, task counts  
  12px  — buttons, badges, base body
  13px  — task titles, email subjects
  14px  — card headings
  16px  — modal/drawer titles
  20px  — page title "My Day", weather temp
```

### Radius

```
6px   — badges, pills
8px   — inputs, priority buttons
10px  — day pills, nav buttons  
12px  — header buttons
16px  — FAB
18px  — all bento cards
20px  — modals
```

### Shadows (restrained — Luma uses mostly borders, not shadows)

```css
/* Cards — default: border only, barely any shadow */
box-shadow: 0 1px 2px rgba(0,0,0,0.03);
border: 1px solid #E8E9EB;

/* Cards — hover: subtle accent glow */
box-shadow: 0 4px 16px ${accent}10;

/* Sticky header */
backdrop-filter: blur(16px) saturate(1.1);
background: rgba(242, 243, 245, 0.88);
border-bottom: 1px solid #E8E9EB;

/* FAB */
box-shadow: 0 6px 24px rgba(26,27,30,0.16);

/* Modal overlay */
background: rgba(0,0,0,0.12);
backdrop-filter: blur(3px);

/* Modal card */
box-shadow: 0 20px 60px rgba(26,27,30,0.12);

/* Detail panel */
box-shadow: -8px 0 32px rgba(26,27,30,0.08);
```

---

## 5. Task Data Model

### Categories & Subtypes

```
PERSONAL
├── Home Chores
│   ├── grocery    🛒  "Grocery"
│   ├── cleanup    🧹  "Clean up"
│   └── laundry    👕  "Laundry"
├── Appointments
│   ├── nails      💅  "Nails"
│   ├── doctor     🩺  "Doctor"
│   ├── dentist    🦷  "Dentist"
│   └── hair       ✂️  "Hair"
└── Legal & Bills
    ├── taxes      📋  "Taxes"
    ├── rent       🏠  "Rent"
    └── bills      💳  "Bills"

WORK
└── Tasks
    ├── meeting    📅  "Meeting"
    ├── task       ⚡  "Do task"
    ├── message    ✉️  "Send message / email"
    └── social     📱  "Social media post"

SPORT
├── Gym (weekly goal: 3 sessions → show as progress ring with count)
│   ├── gym_lower  🦵  "Lower body"
│   ├── gym_upper  💪  "Upper body"
│   └── gym_full   🏋️  "Full body"
└── Run (weekly goal: tracked in KILOMETERS, not sessions)
    ├── run_easy   🏃  "Easy run"
    ├── run_long   🛤️  "Long run"
    └── run_tempo  ⏱️  "Tempo / Interval"
```

### Task Interface

```typescript
interface Task {
  id: string;
  user_id: string;
  category: 'personal' | 'work' | 'sport';
  subtype: string;
  title: string;
  note?: string;
  priority: 1 | 2 | 3;
  deadline?: string;             // ISO datetime
  date: string;                  // YYYY-MM-DD
  done: boolean;
  done_at?: string;
  sort_order: number;            // For drag reorder
  distance_km?: number;          // Run tasks only
  calendar_event_id?: string;    // Google Calendar link
  created_at: string;
}
```

### Urgency Scoring

```typescript
function urgencyScore(task: Task): number {
  // RULE: Completed tasks ALWAYS at bottom
  if (task.done) return -1;
  
  let score = (task.priority || 1) * 10;
  if (task.deadline) {
    const ms = new Date(task.deadline).getTime() - Date.now();
    if (ms < 0)              score += 10000;   // Overdue
    else if (ms < 3_600_000) score += 5000;    // < 1 hour
    else if (ms < 14_400_000) score += 2000;   // < 4 hours
    else if (ms < 86_400_000) score += 500;    // < 24 hours
    else                     score += 100;
  }
  return score;
}
// Sort order inside each card:
// 1. Calendar events (by time, earliest first)
// 2. Active tasks (by urgency score, highest first)
// 3. ── dashed divider ──
// 4. Completed tasks (by done_at, most recent first) — strikethrough + dimmed
```

---

## 6. Core Behaviors (7 rules)

### Rule 1: Task Completion — Sink to Bottom (NOT hide)

- Click the **checkbox ONLY** to mark done. Clicking task row opens detail panel.
- On check:
  1. Checkbox fills with category accent + ✓ icon
  2. Title gets `line-through` + `opacity: 0.4`
  3. Task smoothly ANIMATES DOWN to bottom of card (Framer Motion `layout` + `AnimatePresence`)
  4. Thin dashed divider separates active from done tasks
  5. Task stays visible forever — never hidden
- To undo: click filled checkbox → task animates back UP to urgency position
- NO done drawer, NO done screen, NO hiding

### Rule 2: Google Calendar = Single Source of Truth

- All recurring/scheduled items come FROM Google Calendar
- Dashboard fetches events → auto-categorizes → shows as checkable tasks
- Victoria adds her schedule to Google Calendar:
  - Tuesday: "Easy Run" 
  - Wednesday: "Tempo Run", "Intervals"
  - Gym sessions, meetings, appointments — all in Calendar
- Dashboard keyword-matches events into correct bento cards
- Manual + button is for one-off tasks only
- If a card has NO tasks AND no calendar events → show single centered `[+ Add task]` button. No illustrations, no "empty" text.

### Rule 3: Task Detail Panel (right slide-out)

- **Trigger:** Click ANYWHERE on task row EXCEPT the checkbox
- Panel: 380px wide, slides from right
- Overlay: semi-transparent + backdrop-blur, click to close
- Panel contains: full task info, editable fields, delete button
- For run tasks: `distance_km` input field
- For calendar events: shows linked calendar name

### Rule 4: Draggable Tasks = Priority Reorder

- Each task is draggable within its card via @dnd-kit
- Drag handle (⋮⋮ 6-dot grip) appears on hover, left side
- Drag UP = higher priority, drag DOWN = lower
- Priority badge auto-updates based on position:
  - Top third → High
  - Middle third → Med  
  - Bottom third → Low
- `sort_order` saved to database
- Completed tasks at bottom are NOT draggable
- Calendar events can also be reordered

### Rule 5: Sport Tracking

**Gym:** Progress ring shows sessions completed / 3 weekly goal
- Ring: `2/3` center text → when 3/3 shows ✓ checkmark

**Run:** Progress ring shows TOTAL KILOMETERS this week
- Ring: `18.5 km` center text
- Fills based on configurable weekly km goal (default 30km from `profiles.weekly_run_goal_km`)
- When completing a run task, detail panel prompts for distance
- `distance_km` stored on each run task
- Weekly total = sum of all done run tasks this week

**Display in Sport card header area:**
```
     (Gym 2/3)         (Run 18.5 km)
    [ring icon]        [ring icon]
```

### Rule 6: Weather Widget

- Lives INSIDE the SummaryCard, right-aligned
- Small pill: iOS-style SVG icon + temp + condition + wind
- Background: subtle gray pill `#EDF0F4` → `#F5F6F8`
- Data: OpenWeatherMap, Kraków, Celsius
- SVG icons for: sunny, partly cloudy, cloudy, rain, snow, thunderstorm, fog/mist
- Refresh once per dashboard load

### Rule 7: AI Daily Summary

- Top card, ✨ sparkle + "DAILY BRIEF" label
- Calls Claude: max 3 sentences, warm, personal, addressed to Victoria
- Inputs: task count, priorities, meetings, sport, weather
- 1-2 emojis max
- Shimmer loading skeleton while fetching
- Fallback: locally generated greeting if API fails

---

## 7. Views & Layout

### Segmented Toggle: Today | Week | Month

### Today View

```
┌──────────────────────────────────────────────────────┐
│  STICKY HEADER                                       │
│  My Day                               (done count)   │
│  Wednesday, March 25                                 │
│  [ Today ][ Week ][ Month ]                          │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  ✨ Daily Brief                        ┌───────────┐ │
│  Happy Wednesday! You have              │ ☀️  12°  │ │
│  3 meetings and a lower body            │ Sunny     │ │
│  session today 💪                       │ 💨 15     │ │
│                                         └───────────┘ │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  📧 Priority Inbox                  3 unread         │
│  ● Sarah Chen — Design review feedback...            │
│  ● Daniel (YC) — Follow up: contract...              │
│  ● Fluxon — Sprint planning next week...             │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  ☀️ Personal                   3 tasks          [+]  │
│  ≡ ☐  💳 Pay electricity        [High] [Overdue]     │
│  ≡ ☐  🛒 Grocery                [Med]  [2h]          │
│  ≡ ☐  👕 Laundry                [Low]                │
│  · · · · · · · · · · · · · · · · · · · · · · · · ·  │
│  ≡ ☑  🧹 C̶l̶e̶a̶n̶ ̶u̶p̶               (dimmed, sunk)    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  💻 Work               2 tasks · 3 events       [+]  │
│  📅  Sprint planning                  10:00 AM       │ ← calendar
│  📅  Client review — Astoria          2:00 PM        │ ← calendar
│  📅  Team standup                     4:30 PM        │ ← calendar
│  ≡ ☐  ⚡ Finalize mockups             [High]          │
│  ≡ ☐  📱 LinkedIn post                [Med]           │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  🏃‍♀️ Sport                  1 task              [+]  │
│       (Gym 1/3)       (Run 12.5 km)                  │
│  ≡ ☐  🦵 Lower body                  [Med]           │
│  · · · · · · · · · · · · · · · · · · · · · · · · ·  │
│  ≡ ☑  🏃 E̶a̶s̶y̶ ̶r̶u̶n̶ — 5.2 km         (dimmed)        │
└──────────────────────────────────────────────────────┘

                                            ┌────────┐
                                            │   +    │ FAB
                                            └────────┘
```

**Interactions:**
- `≡` = drag handle (hover-only)
- `☐` = checkbox click → complete
- Click task text → detail panel slides from right
- `☑` completed tasks sink to bottom, dimmed, strikethrough
- Cards are draggable to reorder (drag from card header)

### Week View
- `‹ Mar 24 — Mar 30 ›` navigation
- 7 horizontal day pills (today = dark bg)
- Same 3 bento cards showing all tasks for visible week
- Calendar events included
- Tasks checkable and draggable

### Month View
- `‹ March 2026 ›` navigation
- 7-column grid (Mon–Sun)
- Today = dark bg, white text
- Each cell shows category-colored dots with task count
- Click any day → opens Add Task modal with that date
- Overview/navigation only — no inline task lists

---

## 8. Component Specs

### TaskItem.tsx — THE MOST IMPORTANT COMPONENT

```
Layout: flex row, gap-10, padding "10px 0"

Children:
  1. Drag handle  — 6-dot grip (⋮⋮), 14px, #C5C7CC
                    ONLY visible on hover
                    cursor: grab
                    
  2. Checkbox     — 20px circle, dedicated click zone (28px hit area)
                    Unchecked: Circle stroke #D0D2D6, strokeWidth 1.5
                    Checked: filled circle + Check icon, category accent color
                    onClick: toggle done state
                    
  3. Content area — flex column (ENTIRE row is clickable → opens detail panel)
                    Row 1: emoji + title + optional note (muted)
                    Row 2: badges (priority pill, deadline pill, time pill)

States:
  ACTIVE:      full opacity, pointer cursor on content
  COMPLETING:  checkbox animates fill (200ms spring)
               text: line-through + opacity 0.4
               row: animates down to bottom of list (400ms ease-out)
  DONE:        stays at bottom, dimmed, strikethrough
               checkbox still clickable to undo
               NOT draggable
  DRAGGING:    scale(1.02), elevated shadow, bg white
               original position shows ghost at 30% opacity
```

### TaskDetailPanel.tsx

```
Position: fixed right-0 top-0 bottom-0, z-index 80
Width: 380px (90vw on mobile)
Background: #FFFFFF
Border-left: 1px solid #E8E9EB
Shadow: -8px 0 32px rgba(26,27,30,0.08)
Animation: translateX(100%) → translateX(0), 280ms ease-out
Overlay: fixed inset, rgba(0,0,0,0.12) + backdrop-blur(3px)
Close: click overlay OR × button OR Escape key

Content layout (scrollable, padding 24px):
┌────────────────────────────────┐
│ [×]                            │
│                                │
│ 🛒  GROCERY              (22px emoji, 10px uppercase label)
│ ─────────────────────────────  │
│ Title: [editable inline]       │
│ Note:  [editable textarea]     │
│                                │
│ Category    ☀️ Personal        │
│ Priority    [● High ▾]   (editable dropdown)
│ Date        Mar 25, 2026       │
│ Deadline    Today, 4:00 PM     │
│ Created     10:15 AM           │
│ Status      ○ Active / ✓ Done  │
│                                │
│ ── If calendar event ────────  │
│ 📅  "Grocery run"              │
│     Personal calendar          │
│                                │
│ ── If run task ──────────────  │
│ Distance  [ 5.2 ] km          │ (number input)
│                                │
│                                │
│ [Delete task]   (red text, bottom)
└────────────────────────────────┘
```

### BentoCard.tsx

```
Container: white, rounded-18, border: category.border
Hover: subtle accent shadow glow

Sections:
  1. HEADER — category bg tint
     Left: emoji (20px) + label (14px/700) + task count (10px/muted)
     Right: [+] button (30px circle, accent bg, white + icon)
     
  2. SPORT ONLY — progress rings row
     Centered, gap-24
     Gym ring: sessions X/3
     Run ring: XX.X km
     Border-bottom: category border
     
  3. TASK LIST — scrollable, max-height 400px
     Sort: calendar events (by time) → active tasks (by urgency) → divider → done tasks
     Each item: TaskItem component
     Divider between active/done: dashed line, 1px, #E8E9EB
     
  4. EMPTY STATE — if zero tasks AND zero calendar events:
     Single centered button: [+ Add task]
     No illustrations, no messages
     Button: ghost style, category accent text, 12px/600
```

### SummaryCard.tsx

```
White card, rounded-18, border #E8E9EB
Flex row:
  Left (flex-1):
    ✨ icon + "DAILY BRIEF" (10px uppercase, #8C8F96)
    AI text (13.5px/500, #3D3E42, line-height 1.55)
  Right (flex-shrink-0):
    WeatherWidget
Loading: 2 shimmer bars (85% and 60% width)
```

### WeatherWidget.tsx

```
Container: rounded-14, padding 10px 14px, min-width 72px
Background: linear-gradient(180deg, #EDF0F4, #F5F6F8)
Border: 1px solid #E4E7EC
Layout: column, centered

Children:
  SVG weather icon (32px) — custom iOS-style:
    Sunny: yellow circle + rays
    Partly cloudy: sun + overlapping gray cloud
    Cloudy: layered gray ellipses
    Rain: cloud + blue diagonal lines
    Snow: cloud + blue circles
    Thunder: cloud + yellow bolt
    Fog: horizontal gray lines
  Temperature: "12°" (20px/800, #1A1B1E)
  Condition: "Sunny" (9px/500, capitalize, #8C8F96)
  Wind: "💨 15 km/h" (8px, #C5C7CC)
```

### EmailCard.tsx

```
White card, rounded-18, border #E8E9EB
Header area (bg #FAFBFC):
  Left: mail icon in indigo-tinted square (28px, rounded-8)
  Text: "Priority Inbox" (14px/700) + "X unread" (10px/muted)
Body: top 5 emails, each:
  Blue dot (6px) + sender name (12px/600) 
  Subject line (12px/500, #3D3E42)
  Snippet (11px, #8C8F96)
Loading: 3 shimmer rows
Empty: "Inbox zero — nice!" + faded mail icon
```

### AddTaskModal.tsx

```
Centered overlay, rounded-20, max-width 420px, padding 24px
Scrollable if content overflows

Sections:
  1. "New Task" + [×] close
  2. Category pills: 3 buttons (Personal/Work/Sport) — active = accent bg
  3. Subtype grid: grouped by category group label
  4. Title input (optional)
  5. Note input (optional)
  6. Priority: 3 buttons (High/Med/Low) with colored borders
  7. Date picker + optional deadline datetime picker
  8. [Add Task] button — full width, category accent bg
```

---

## 9. API Routes

### GET `/api/calendar`
- Fetches today's events from ALL 3 Google accounts
- Merges, deduplicates by event ID
- Auto-categorizes each event (see Section 10)
- Returns `{ events: CalendarEvent[] }`
- Cache: 5 minutes

### GET `/api/emails`  
- Fetches top 5 important unread from Gmail
- Returns `{ emails: { from, subject, snippet, date }[] }`
- Cache: 10 minutes

### GET `/api/weather`
- OpenWeatherMap current weather, Kraków
- Returns `{ temp, condition, humidity, wind }`
- Cache: 30 minutes

### POST `/api/summary`
- Input: `{ taskCount, highPriority, meetings, sportPlan, events, doneCount, weather }`
- Calls Claude with personalized prompt
- Returns `{ text: string }`
- Fallback locally if API fails

---

## 10. Google Calendar Integration

### Event → Card Mapping

```typescript
const SPORT_KEYWORDS = [
  'run', 'easy run', 'long run', 'tempo', 'interval', 'intervals',
  'gym', 'lower body', 'upper body', 'full body',
  'workout', 'training', 'exercise'
];

const WORK_KEYWORDS = [
  'meeting', 'standup', 'call', 'review', 'sync',
  'sprint', 'retro', 'planning', 'demo', 'interview',
  'presentation', 'workshop', '1:1', 'one on one'
];

function categorizeEvent(title: string): 'personal' | 'work' | 'sport' {
  const t = title.toLowerCase();
  if (SPORT_KEYWORDS.some(k => t.includes(k))) return 'sport';
  if (WORK_KEYWORDS.some(k => t.includes(k))) return 'work';
  return 'personal';
}

function inferSubtype(title: string, category: string): string {
  const t = title.toLowerCase();
  if (category === 'sport') {
    if (t.includes('easy'))               return 'run_easy';
    if (t.includes('long run'))           return 'run_long';
    if (t.includes('tempo') || t.includes('interval')) return 'run_tempo';
    if (t.includes('lower'))              return 'gym_lower';
    if (t.includes('upper'))              return 'gym_upper';
    if (t.includes('full body'))          return 'gym_full';
    if (t.includes('run'))                return 'run_easy';
    if (t.includes('gym'))                return 'gym_full';
  }
  if (category === 'work') {
    if (t.includes('meeting') || t.includes('call') || t.includes('sync')) return 'meeting';
    return 'task';
  }
  return 'task';
}
```

### Sync Flow
1. On dashboard load → GET `/api/calendar`
2. For each event, check if `calendar_event_id` already exists in tasks table
3. If new → create task row with `calendar_event_id` set
4. If existing → update title/time if changed
5. If event deleted from Calendar → leave task but clear `calendar_event_id`

### Victoria's Predefined Weekly Sport Schedule (via Google Calendar)
```
Tuesday:    "Easy Run"              → sport / run_easy
Wednesday:  "Tempo Run"             → sport / run_tempo  
Wednesday:  "Intervals"             → sport / run_tempo
(+ Gym sessions as scheduled)
```
These are Google Calendar recurring events. The dashboard just reads them.

---

## 11. Animations (Framer Motion)

### Task completion — sink to bottom
```typescript
// Use Framer Motion layoutId + AnimatePresence
// When task.done changes to true:
<motion.div
  layout
  transition={{ type: "spring", stiffness: 300, damping: 30 }}
  animate={{ opacity: task.done ? 0.4 : 1 }}
>
  <TaskItem />
</motion.div>
// The `layout` prop automatically animates position changes
// when the sort order changes (done tasks move to bottom)
```

### Detail panel — slide in
```typescript
<AnimatePresence>
  {selectedTask && (
    <>
      <motion.div  // overlay
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div  // panel
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      />
    </>
  )}
</AnimatePresence>
```

### Task enter — fade up
```css
initial={{ opacity: 0, y: 6 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.25 }}
```

### Drag — lift and settle
```
Dragging: scale 1.02, boxShadow elevated, bg white
Drop: spring back with overshoot
```

### Card hover — subtle glow
```css
transition: box-shadow 0.2s ease;
&:hover { box-shadow: 0 4px 16px ${accent}10; }
```

---

## 12. Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google APIs
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Notion
NOTION_API_KEY=
NOTION_DATABASE_ID=

# Weather
OPENWEATHERMAP_API_KEY=

# AI Summary
ANTHROPIC_API_KEY=
```

---

## 13. Implementation Order

See updated order in Section 14 (includes Notion integration).

---

## 14. Notion Integration (Two-Way Sync)

### Overview

Notion acts as an **alternative task source** with full two-way sync. Tasks created in Notion appear in the dashboard. Tasks created or completed in the dashboard sync back to Notion. Google Calendar remains the primary source for scheduled events — Notion is for project tasks, client work, and anything that benefits from Notion's richer context (linked docs, databases, etc.).

### Notion Database Schema

Victoria will create a single Notion database called **"Dashboard Tasks"** with these properties:

```
Property          Type           Mapping
─────────────────────────────────────────────────
Title             Title          → task.title
Category          Select         → task.category
                                   Options: Personal, Work, Sport
Subtype           Select         → task.subtype
                                   Options: all subtypes from constants
Priority          Select         → task.priority
                                   Options: High, Medium, Low
Date              Date           → task.date
Deadline          Date           → task.deadline
Done              Checkbox       → task.done
Done At           Date           → task.done_at
Note              Rich Text      → task.note
Distance (km)     Number         → task.distance_km  (run tasks)
Source             Select         → origin tracking
                                   Options: Dashboard, Notion, Calendar
Dashboard ID      Rich Text      → task.id (Supabase UUID, for sync)
```

### Database Schema Update

Add to the `tasks` table:

```sql
ALTER TABLE tasks ADD COLUMN notion_page_id TEXT UNIQUE;
-- Links a task to its Notion page for two-way sync
CREATE INDEX idx_tasks_notion ON tasks(notion_page_id);
```

### API Routes

#### GET `/api/notion/sync`
- Queries Notion database for all tasks where `Done` is unchecked OR `Done At` is within last 7 days
- For each Notion page:
  - If `Dashboard ID` exists → update existing Supabase task with Notion changes
  - If `Dashboard ID` is empty → create new Supabase task, write back the UUID to Notion's `Dashboard ID` property
- Returns `{ synced: number, created: number, updated: number }`

#### POST `/api/notion/push`
- Called when a task is created, updated, or completed in the dashboard
- If task has `notion_page_id` → update the existing Notion page
- If task has no `notion_page_id` and was created in dashboard → create new Notion page, store `notion_page_id` on the task
- Payload: `{ taskId: string, changes: Partial<Task> }`

### Sync Logic

```typescript
// Direction 1: Notion → Dashboard (on load + every 5 min)
async function pullFromNotion() {
  const notionPages = await notion.databases.query({
    database_id: NOTION_DATABASE_ID,
    filter: {
      or: [
        { property: 'Done', checkbox: { equals: false } },
        { property: 'Done At', date: { past_week: {} } },
      ]
    }
  });

  for (const page of notionPages.results) {
    const dashboardId = getProperty(page, 'Dashboard ID');
    const taskData = mapNotionToTask(page);

    if (dashboardId) {
      // Update existing task (Notion wins on conflict for title/note/priority)
      await supabase.from('tasks').update(taskData).eq('id', dashboardId);
    } else {
      // New task from Notion
      const { data } = await supabase.from('tasks').insert({
        ...taskData,
        notion_page_id: page.id
      }).select().single();

      // Write Dashboard ID back to Notion
      await notion.pages.update({
        page_id: page.id,
        properties: { 'Dashboard ID': { rich_text: [{ text: { content: data.id } }] } }
      });
    }
  }
}

// Direction 2: Dashboard → Notion (on task change)
async function pushToNotion(task: Task) {
  const notionProps = mapTaskToNotion(task);

  if (task.notion_page_id) {
    // Update existing Notion page
    await notion.pages.update({
      page_id: task.notion_page_id,
      properties: notionProps
    });
  } else {
    // Create new Notion page
    const page = await notion.pages.create({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        ...notionProps,
        'Dashboard ID': { rich_text: [{ text: { content: task.id } }] },
        'Source': { select: { name: 'Dashboard' } }
      }
    });
    // Store Notion page ID on task
    await supabase.from('tasks')
      .update({ notion_page_id: page.id })
      .eq('id', task.id);
  }
}
```

### Conflict Resolution

```
Priority order when both sides changed:
1. Done status    → most recent change wins (compare done_at timestamps)
2. Title / Note   → Notion wins (richer editing environment)
3. Priority       → Dashboard wins (drag reorder is the primary interaction)
4. Distance (km)  → Dashboard wins (entered in detail panel)
5. New tasks      → both create, linked via Dashboard ID ↔ notion_page_id
```

### Sync Triggers

```
Notion → Dashboard:
  - On dashboard load (initial pull)
  - Every 5 minutes (polling via setInterval)
  - Manual "Sync now" button in header (optional)

Dashboard → Notion:
  - On task create (immediate push)
  - On task complete/uncomplete (immediate push)
  - On task edit in detail panel (debounced 2s push)
  - On task delete (archive Notion page, don't hard delete)
```

### Task Source Indicator

In TaskItem.tsx, show a tiny source icon next to the task:

```
📅 = from Google Calendar
N  = from Notion (small "N" icon in a rounded square, #1A1B1E bg)
+  = created manually in dashboard (no icon needed)
```

In TaskDetailPanel.tsx, show the source with a link:

```
── Source ─────────────────
📅 Google Calendar: "Sprint Planning"
   → Open in Calendar

N  Notion: "Finalize mockups"
   → Open in Notion    (link to notion page URL)
```

### Environment Variables (add to .env)

```env
# Notion
NOTION_API_KEY=                    # Internal integration token
NOTION_DATABASE_ID=                # "Dashboard Tasks" database ID
```

### Directory Structure (additions)

```
├── lib/
│   └── hooks/
│       └── useNotionSync.ts       # Pull + push logic
├── app/
│   └── api/
│       └── notion/
│           ├── sync/route.ts      # GET: pull from Notion
│           └── push/route.ts      # POST: push to Notion
```

### Setup Instructions for Victoria

```
1. Go to notion.so/my-integrations → Create new integration
   - Name: "Dashboard Sync"
   - Capabilities: Read content, Update content, Insert content
   - Copy the Internal Integration Token → NOTION_API_KEY

2. Create a new Notion database called "Dashboard Tasks"
   - Add all properties listed above (Category, Subtype, Priority, etc.)
   - The "Select" properties need the exact option names listed

3. Share the database with your integration
   - Open "Dashboard Tasks" → ••• menu → Connections → Add "Dashboard Sync"

4. Copy the database ID from the URL
   - notion.so/YOUR-WORKSPACE/{DATABASE_ID}?v=...
   - → NOTION_DATABASE_ID
```

---

## Updated Implementation Order

```
Phase 1 — Foundation
  1. Next.js project + Tailwind + shadcn/ui setup
  2. Supabase schema + RLS policies (including notion_page_id column)
  3. Google OAuth login
  4. Zustand store + types

Phase 2 — Core UI
  5. Layout: Luma bg, DM Sans font, sticky header
  6. View toggle (Today/Week/Month)
  7. BentoCard shell (3 cards, draggable order)
  8. TaskItem component with checkbox + content zones + source icons
  9. AddTaskModal

Phase 3 — Task Logic
  10. Task CRUD (add, complete, delete)
  11. Urgency sorting + done-sinks-to-bottom behavior
  12. Task drag reorder within cards (@dnd-kit)
  13. TaskDetailPanel (right slide-out, with source links)

Phase 4 — Integrations
  14. Google Calendar sync → auto-categorize events
  15. Notion two-way sync (pull on load, push on change)
  16. Gmail priority inbox
  17. Weather API
  18. AI Summary (Claude)

Phase 5 — Sport
  19. Progress rings (Gym sessions, Run km)
  20. distance_km input on run task completion
  21. Weekly aggregation

Phase 6 — Views
  22. Week view (day strip + full week tasks)
  23. Month view (calendar grid + dots)

Phase 7 — Polish
  24. Framer Motion animations
  25. Loading skeletons
  26. Error states + sync status indicators
  27. Mobile responsive (390px)
  28. Vercel deployment
```

---

## Quick Reference Card

| Feature | Behavior |
|---|---|
| Check task | Checkbox ONLY → strikethrough + dim + sink to bottom |
| Click task | Opens right detail panel |
| Drag task | Reorder priority within card |
| Drag card | Reorder bento cards |
| Calendar events | Auto-pulled from Google Calendar, categorized by keywords |
| Notion sync | Two-way: pull on load + every 5min, push on every change |
| Source icons | 📅 Calendar · **N** Notion · (none) Manual |
| Empty card | Shows `[+ Add task]` button only |
| Run tracking | km logged per task, ring shows weekly total |
| Gym tracking | Sessions X/3, ring shows progress |
| Weather | Small widget inside AI summary card |
| Background | Luma-style flat cool gray `#F2F3F5` |
