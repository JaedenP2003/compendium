require('dotenv').config();
const pool = require('../src/db/pool');
const slugify = require('../src/services/slugify');

const entries = [
  // ---------------------------------------------------------------- BudgetingApp
  {
    title: 'Safe SQLite Schema Migration via PRAGMA Column Checks',
    category: 'treasure',
    summary: 'Evolving a raw-SQLite schema forward without an ORM migration framework, without losing data.',
    tags: ['sqlite', 'csharp', 'migrations', 'repo:budgetingapp'],
    content: `From \`BudgetingApp.Core\`, which uses \`Microsoft.Data.Sqlite\` directly — no
EF Core, no migration framework. When a new column needs to be added to an
existing table with existing user data, the pattern is: check whether the
column already exists via \`PRAGMA table_info\`, and if not, rebuild the table
inside a transaction rather than risk an in-place \`ALTER TABLE\` losing data.

\`\`\`csharp
// BudgetingApp.Core/Storage/BudgetDatabase.cs
var hasAccountId = false;
using (var cmd = connection.CreateCommand())
{
    cmd.CommandText = "PRAGMA table_info(transactions)";
    using var reader = cmd.ExecuteReader();
    while (reader.Read())
    {
        if (reader.GetString(1) == "account_id") hasAccountId = true;
    }
}

if (!hasAccountId)
{
    // CREATE new table shape -> INSERT SELECT from old -> DROP old -> RENAME
    // all inside one transaction, backfilling account_id to a default
    // "Checking" account for existing rows.
}
\`\`\`

**Why reusable:** any project using raw SQLite (no ORM) needs this exact
shape of defensive migration — detect via \`PRAGMA table_info\`, then
CREATE-new/INSERT-SELECT/DROP/RENAME atomically. It's the SQLite equivalent
of an EF Core migration, hand-rolled, and it's what to reach for on any
future small app that wants SQLite's simplicity without pulling in a full
ORM just for schema evolution.`,
  },
  {
    title: 'Priority-Ordered Rule-Based Categorization Engine',
    category: 'treasure',
    summary: 'A small, pure function that assigns categories to imported transactions by walking prioritized match rules.',
    tags: ['csharp', 'algorithms', 'repo:budgetingapp'],
    content: `\`CategorizationEngine.MatchCategory\` walks a list of category rules in
priority order — each rule is a contains/exact/regex match against the
transaction description — and returns the first one that matches.

\`\`\`csharp
// BudgetingApp.Core/Categorization/CategorizationEngine.cs
foreach (var rule in rules.OrderBy(r =&gt; r.Priority))
{
    var isMatch = rule.MatchType switch
    {
        MatchType.Contains =&gt; description.Contains(rule.Pattern, StringComparison.OrdinalIgnoreCase),
        MatchType.Exact    =&gt; description.Equals(rule.Pattern, StringComparison.OrdinalIgnoreCase),
        MatchType.Regex    =&gt; Regex.IsMatch(description, rule.Pattern,
                                  RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1)),
        _ =&gt; false
    };
    if (isMatch) return rule.CategoryId;
}
\`\`\`

**Two details worth stealing:**

1. **The regex timeout.** \`RegexOptions.IgnoreCase\` alone isn't enough —
   \`TimeSpan.FromSeconds(1)\` guards against a catastrophic-backtracking
   regex (user-supplied or otherwise) hanging the import. Any app accepting
   user-defined regex rules needs this.
2. **The same static method is called from two different persistence
   backends** (SQLite desktop store and the Blazor WASM localStorage store)
   instead of being reimplemented per-platform — keeps categorization logic
   from drifting between the two.

This generalizes to any "match input against prioritized rules, first hit
wins" problem — spam filters, routing rules, permission checks.`,
  },
  {
    title: 'Dual Persistence Strategy for One Shared Domain Model',
    category: 'weapons',
    summary: 'When a WASM frontend can\'t use the same storage engine as desktop, mirror the repository interface instead of syncing engines.',
    tags: ['architecture', 'csharp', 'blazor', 'repo:budgetingapp'],
    content: `BudgetingApp ships both a WPF desktop app (SQLite via
\`Microsoft.Data.Sqlite\`) and a Blazor WebAssembly app. WASM can't durably
use SQLite without extra OPFS/IndexedDB VFS plumbing, so instead of forcing
one storage engine everywhere, the WASM side reimplements the **same
repository interface shape** against \`Blazored.LocalStorage\`:

\`\`\`csharp
// BudgetingApp.Web/Storage/WebBudgetStore.cs
// Desktop uses SQLite via BudgetDatabase/repositories.
// WASM can't durably use SQLite without extra VFS work, so this store
// implements the identical repository shape against browser localStorage
// instead of trying to make one storage engine work everywhere.
\`\`\`

The two stores never need to talk to each other directly — a separate
\`BudgetingApp.ExportTool\` console app bridges them by exporting desktop data
to a JSON \`BackupData\` blob that the web app can import.

**The reusable principle:** when a platform constraint forces a different
storage engine for one frontend, don't try to sync the engines — mirror the
*interface* (repository contract) and keep pure domain logic (like the
categorization engine above) shared and platform-agnostic. Use an
export/import bridge for occasional migration between them rather than
building live sync you don't actually need.`,
  },

  // ---------------------------------------------------------------- FocusTracker
  {
    title: 'Server-Authoritative Countdown Timer (Absolute Timestamp, Not a Counter)',
    category: 'weapons',
    summary: 'Storing when a timer ends, not how much time is left, to avoid drift and survive reloads/backgrounding for free.',
    tags: ['react', 'nextjs', 'state', 'repo:focustracker'],
    content: `The classic bug with a countdown timer is storing "seconds remaining" as
state — every reload, backgrounded tab, or missed \`setInterval\` tick causes
drift. FocusTracker instead stores \`phase_ends_at\`, an absolute timestamp,
in Postgres, and every client derives remaining time from wall-clock math:

\`\`\`ts
// src/components/FocusScreen.tsx
function remainingSecondsFor(endsAt: string): number {
  const remaining = (new Date(endsAt).getTime() - Date.now()) / 1000;
  return Math.max(0, Math.round(remaining));
}
\`\`\`

Because the source of truth is a timestamp, not a mutable counter, opening
the app on a second device or reloading the tab just recomputes the correct
remaining time — nothing to resync, nothing that can drift. Combined with a
Supabase Realtime subscription (see [[supabase-realtime-cross-tab-sync-via-postgres-changes]]
for the same pattern in a sibling app) and a last-write-wins guard on
\`updated_at\`, every open tab converges on the same countdown automatically.

**When to reach for this:** any timer, countdown, or "time until X" feature
that needs to survive reloads, backgrounding, or multiple simultaneous
clients. Store the target timestamp, derive the display value — never store
the display value itself as authoritative state.`,
  },
  {
    title: 'Supabase SSR Auth Middleware (Next.js)',
    category: 'materials',
    summary: 'The canonical cookie-bridging pattern for gating Next.js routes behind Supabase auth at the middleware layer.',
    tags: ['nextjs', 'supabase', 'auth', 'repo:focustracker'],
    content: `\`@supabase/ssr\`'s documented pattern for Next.js middleware — bridging
cookies between the incoming request and the outgoing response so the
server-side Supabase client can read/refresh the session on every request:

\`\`\`ts
// src/middleware.ts
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () =&gt; request.cookies.getAll(),
      setAll: (cookiesToSet) =&gt; {
        cookiesToSet.forEach(({ name, value }) =&gt; request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =&gt;
          response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user &amp;&amp; !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return response;
}
\`\`\`

**Directly reusable boilerplate** for any Next.js + Supabase project that
needs route-level auth gating — this exact \`getAll\`/\`setAll\` cookie bridge
is what \`@supabase/ssr\` requires, and it's easy to get subtly wrong (missing
the response-cookie mirroring step causes silent session-refresh failures).
Worth keeping this snippet on hand rather than re-deriving it from docs each
time a new Next.js + Supabase project starts.`,
  },
  {
    title: 'RLS-First Schema Even for Single-User Apps',
    category: 'weapons',
    summary: 'Baking row-level security into a schema from day one, even when only one user will ever exist, so the auth boundary is never retrofitted.',
    tags: ['postgres', 'supabase', 'security', 'repo:focustracker'],
    content: `Every table in FocusTracker's schema has Row-Level Security enabled with an
\`auth.uid() = user_id\` policy, despite the app being explicitly single-user
by design:

\`\`\`sql
-- supabase/schema.sql
alter table session_state enable row level security;
create policy "Users manage their own session state"
  on session_state for all
  using (auth.uid() = user_id);

-- RLS still gates realtime broadcast, not just direct queries —
-- has to be enabled per-table for the realtime publication too.
alter publication supabase_realtime add table session_state;
\`\`\`

**Why this is worth copying even when "it's just me using it":** retrofitting
row-level security onto a schema that grew up without it is far more
error-prone than building it in from the first migration — every new table
just follows the same policy template. It also documents, in the schema
itself, that RLS is what gates realtime delivery, not just ad-hoc queries —
easy to miss and a real security gap if forgotten on a table that's
streamed via Realtime.

**Rule of thumb going forward:** default every new Supabase table to RLS-on
with an owner policy, even for a personal single-user project — it costs
nothing today and removes an entire category of future "add auth later"
migration risk.`,
  },

  // ---------------------------------------------------------------- Quest
  {
    title: 'Supabase Realtime Cross-Tab Sync via postgres_changes',
    category: 'materials',
    summary: 'Keeping multiple open tabs/devices in sync for a single user\'s data without a custom WebSocket server.',
    tags: ['supabase', 'realtime', 'react', 'repo:quest'],
    content: `Quest subscribes to Postgres change events per table, filtered to the
current user, and patches the client-side store directly on
insert/update/delete:

\`\`\`ts
// src/hooks/useLoadQuestData.ts
const channel = supabase.channel(\\\`quest-data:\\\${userId}\\\`)
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'session_state', filter: \\\`user_id=eq.\\\${userId}\\\` },
    (payload) =&gt; {
      if (payload.eventType === 'DELETE') return;
      setSessionState(mapSessionState(payload.new));
    })
  // ...repeated per table (quests, calendar_events, etc.)
  .subscribe();
\`\`\`

Each table gets its own \`.on('postgres_changes', ...)\` clause on the same
channel, and a row mapper (\`mapSessionState\`) translates the raw Postgres row
into the app's domain shape before it hits the store — keeping Supabase's
row format out of the rest of the codebase.

**When to reach for this:** any single-user-owned-rows app (todo list,
tracker, dashboard) that needs live sync across tabs or devices without
standing up a custom WebSocket server. The \`filter: user_id=eq.\${userId}\`
clause is the important detail — it keeps the subscription scoped so RLS and
network traffic both stay tight to just the current user's rows.`,
  },
  {
    title: 'Calendar Overlap Column-Packing Algorithm',
    category: 'treasure',
    summary: 'The classic "Google Calendar style" algorithm for laying out overlapping time-block events side by side.',
    tags: ['algorithms', 'calendar-ui', 'typescript', 'repo:quest'],
    content: `A self-contained, dependency-free algorithm for rendering overlapping
calendar events without them visually stacking on top of each other:

\`\`\`ts
// src/components/calendar/layout.ts
// 1. Sort events by start time.
// 2. Walk through them, clustering any set of mutually-overlapping events
//    together (an event belongs to a cluster if it overlaps ANY event
//    already in it).
// 3. Within each cluster, assign each event the lowest column index not
//    already taken by an overlapping sibling.
// 4. Size every event in a cluster to 1 / (cluster's max column count)
//    width, so a 3-way overlap becomes three equal side-by-side columns.
\`\`\`

**Why it's worth keeping as a standalone utility:** this is the single most
fiddly part of building any calendar UI, and it's genuinely reusable —
no dependency on Quest's data model, just an array of \`{start, end}\`-shaped
objects in and a column-assigned layout out. Worth lifting into a shared
utility file the next time any project needs a day/week calendar view rather
than re-deriving the clustering logic from scratch.`,
  },
  {
    title: 'TypeScript/PostgREST Generic Type Collapse Bug',
    category: 'creatures',
    summary: 'A real TS 6.0-beta + postgrest-js incompatibility where typed Supabase responses silently degrade to `never` on a second `.data` access.',
    tags: ['typescript', 'supabase', 'bug', 'gotcha', 'repo:quest'],
    content: `**Symptom:** a Supabase query's \`.data\` property types correctly the first
time it's accessed, but a second access (e.g., destructuring it again, or
reading it in a different branch) collapses to \`never\`, breaking type
checking with no runtime error.

**Cause:** a documented incompatibility between TypeScript 6.0-beta and
\`postgrest-js\`'s generic response typing — the generic inference doesn't
survive being narrowed/re-accessed cleanly under that TS version.

**Workaround** (documented directly in the source):

\`\`\`ts
// src/lib/supabase/client.ts
// TS 6.0-beta + postgrest-js: passing the Database generic to
// createClient<Database>() causes .data to collapse to \`never\` on a
// second access. Skip the generic typing here and cast row shapes
// explicitly at the mapper boundary instead (see mappers.ts).
export const supabase = createClient(url, anonKey);
\`\`\`

Instead of fighting the generic, the fix pushes explicit type casting to a
single boundary layer — the row-to-domain mapper functions — so the rest of
the app works with clean, correctly-typed domain objects regardless of what
Supabase's client returns.

**Lesson:** when a library's generic type inference is fighting a specific
compiler version, the fix isn't always "make the generic work harder" — a
single explicit cast at one well-defined boundary can be more robust than
chasing generic inference across a whole codebase, and it's easier for a
future reader to spot exactly where "trust me" typing happens.`,
  },

  // ---------------------------------------------------------------- SoloLeveling
  {
    title: 'Local-First Store with Debounced Full-State Cloud Sync',
    category: 'weapons',
    summary: 'A "full replace, no diff/merge" sync strategy for personal-scale apps: simplest correct approach beats clever conflict resolution.',
    tags: ['sync', 'zustand', 'supabase', 'architecture', 'repo:sololeveling'],
    content: `SoloLeveling is usable fully offline as a guest — Supabase is an optional
add-on, not a hard dependency (\`supabase\` is literally \`undefined\` when env
vars are absent, so every consumer null-checks it). When cloud sync *is*
enabled, the strategy is deliberately simple:

\`\`\`ts
// src/hooks/useCloudSync.ts
useSystemStore.subscribe((state) =&gt; {
  if (hydratingRef.current) return;          // don't push while pulling
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() =&gt; {
    pushFullState(userId, state).catch((err) =&gt; console.error('Cloud push failed:', err));
  }, PUSH_DEBOUNCE_MS); // 1.5s
});
\`\`\`

On sign-in: if it's a brand-new cloud account, push local state up once;
otherwise pull remote state down and overwrite the local store entirely.
There is no per-field diffing or merge logic — every change debounce-pushes
the *entire* state object, and every sign-in does a full overwrite in one
direction or the other. A \`hydratingRef\` guard prevents the initial pull from
immediately triggering a push right back.

**Why this beats a "smarter" sync:** for personal-scale data (one user, a
few KB of state), diff/merge conflict resolution is pure complexity with no
payoff — there's essentially never a real concurrent-edit conflict to
resolve. "Full replace, whichever direction just changed" is correct,
simple, and easy to reason about. Reach for this on any offline-capable
personal app before reaching for CRDTs or operational transforms — those
solve a problem this class of app usually doesn't have.`,
  },
  {
    title: 'RPG Leveling Curve with Cascading Level-Ups',
    category: 'treasure',
    summary: 'An exponential XP formula plus a loop that correctly cascades multiple level-ups from one large XP award.',
    tags: ['gamification', 'algorithms', 'repo:sololeveling'],
    content: `A reusable gamification module: an XP-to-next-level formula that steepens
over time, and level-up logic that doesn't break when a single XP grant is
large enough to cross more than one level boundary.

\`\`\`ts
// src/lib/leveling.ts
function xpToNextLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.55));
}

function applyXp(state: SystemState, xpGained: number): SystemState {
  let { level, xp } = state;
  xp += xpGained;
  while (xp &gt;= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level += 1;
    // award STAT_POINTS_PER_LEVEL, recompute rank, etc. — repeats per
    // level crossed, not just once, so a big XP dump can jump multiple
    // levels correctly in one call.
  }
  return { ...state, level, xp };
}
\`\`\`

**The detail that matters:** using \`while\` instead of \`if\` for the level-up
check. A single large XP award (a big quest completion, a bonus) can cross
more than one level threshold at once — an \`if\` would silently under-award
levels and leave leftover XP unaccounted for. This is the standard shape for
any XP/leveling system and is worth reusing verbatim in any future
gamified feature — habit trackers, quest systems, achievement ladders.`,
  },
  {
    title: 'Penalty/Streak-Break System for Missed Recurring Tasks',
    category: 'treasure',
    summary: 'A full incentive-loop reference implementation: detect missed dailies/weeklies, dock progress, and spawn an escalating makeup task.',
    tags: ['gamification', 'incentive-design', 'repo:sololeveling'],
    content: `A once-per-day-change check (explicitly *not* a live scheduler — a design
choice worth noting) that compares every daily/weekly quest against the
period that just elapsed, and for anything left incomplete:

\`\`\`ts
// src/lib/penalty.ts
function checkForPenalties(state: SystemState): SystemState {
  for (const quest of overdueRecurringQuests(state)) {
    dockXpAndStats(state, quest);
    resetStreak(state, quest.id);
    spawnPenaltyQuest(state, quest, { deadlineHours: 24, difficulty: nextEscalationLevel(quest) });
  }
  return state;
}

function escalateOverduePenalties(state: SystemState): SystemState {
  // a penalty quest that's ALSO missed self-extends with a new 24h
  // deadline at a harder difficulty, rather than just disappearing
  return state;
}
\`\`\`

**Why this is a complete reference worth keeping:** it's the full loop —
detection (compare against elapsed period), consequence (XP/stat dock +
streak reset), and recovery path (a time-boxed makeup task that escalates if
also ignored) — not just a "you missed it" flag. The "check on day-change,
not via a live scheduler" choice is also worth noting: it avoids needing any
background job infrastructure at all, since the check only needs to run
when the user is actually using the app.

Directly reusable for any habit tracker, streak app, or recurring-task
system that wants real stakes for missed commitments without building a
cron/scheduler layer.`,
  },
  {
    title: 'Timezone-Safe Date-Key Parsing',
    category: 'creatures',
    summary: '`new Date("yyyy-MM-dd")` parses as UTC per spec, silently shifting dates for anyone west of UTC.',
    tags: ['javascript', 'dates', 'bug', 'gotcha', 'repo:sololeveling'],
    content: `**The footgun:** \`new Date("2026-08-18")\` is parsed as UTC midnight per the
ECMAScript spec — not local midnight. For anyone in a negative-UTC-offset
timezone, this silently displays as the *previous* day once converted to
local time. A date-key-based app (anything storing "which day" as a
\`yyyy-MM-dd\` string) will show tasks/entries on the wrong day.

**Fix used here:**

\`\`\`ts
// src/lib/period.ts
function parseKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day); // constructs in LOCAL time, not UTC
}
\`\`\`

Passing year/month/day as separate numeric arguments to the \`Date\`
constructor builds the date in local time, sidestepping the string-parsing
UTC behavior entirely.

**Lesson:** never pass a bare \`yyyy-MM-dd\` string to \`new Date()\` when the
result needs to represent a *local* calendar day — always split and
construct via the numeric constructor instead. This is a one-line fix but an
easy one to miss, and it's the kind of bug that only shows up for users in
certain timezones, making it easy to ship without noticing. Worth grepping
for \`new Date(\` calls on any date-key string in future projects.`,
  },

  // ---------------------------------------------------------------- kizuna-rail
  {
    title: 'File-Based JSON "Database" with Auto-Save via Proxy',
    category: 'treasure',
    summary: 'Zero-dependency persistence for a small demo/prototype app: a JS Proxy that auto-saves to disk on every property write.',
    tags: ['javascript', 'node', 'proxy', 'repo:kizuna-rail'],
    content: `A homegrown persistence layer for a course-demo Express app — no database,
just a JSON file on disk, wrapped in a \`Proxy\` so every mutation
transparently triggers a save:

\`\`\`js
// src/models/db-in-file.js
db = new Proxy(db, {
  set: (target, property, value) =&gt; {
    target[property] = value;
    saveDatabase();
    return true;
  }
});
\`\`\`

Any assignment like \`db().confirmations = [...]\` anywhere in the codebase
transparently persists to disk — no explicit "now save" call needed at every
mutation site. Paired with a **seed-or-load bootstrap**: on startup, check if
the JSON file exists and is valid; if not, fall back to bundled seed JSON and
write a fresh file. That makes the datastore self-healing — delete the file,
or hand the repo to someone else, and it just regenerates from seed data.

**When to reach for this:** any demo, prototype, or take-home project that
needs "feels like a database" persistence without the setup cost of an
actual database — the \`Proxy\`-based auto-save eliminates the most common
bug in hand-rolled file persistence (forgetting to call save after a
mutation). Not for anything with concurrent writers or real data-integrity
needs — it's a single-process, single-writer pattern.`,
  },
  {
    title: 'Cross-Platform Port-Killer Dev Script',
    category: 'runes',
    summary: 'A standalone CLI utility that finds and kills whatever process is squatting on a dev-server port, with OS-specific commands.',
    tags: ['node', 'cli', 'dev-tooling', 'repo:kizuna-rail'],
    content: `A small interactive CLI (\`restore.js\`, despite the name — it's not data
restore) that detects and kills processes holding specific ports, with a
command table per OS:

\`\`\`js
// restore.js
const commands = {
  win32:  (port) =&gt; \\\`netstat -ano | findstr :\\\${port}\\\`,
  darwin: (port) =&gt; \\\`lsof -ti :\\\${port}\\\`,
  linux:  (port) =&gt; \\\`lsof -ti :\\\${port}\\\`,
};
// look up process(es) by port for the current platform, then kill them
\`\`\`

Wired into \`package.json\` as \`"reset": "node restore.js 3000 3001"\`, and also
auto-invoked via \`kill-port\` at the start of the \`dev\` script — so a crashed
dev server that left a port bound doesn't block the next \`npm run dev\`.

**Why worth keeping as a standalone utility:** "port already in use" from a
zombie dev-server process is one of the most common local-dev annoyances,
and this is a complete, portable (win32/darwin/linux) fix that can be
dropped into any Node project's tooling — genuinely more useful pulled out
as a shared dev-tooling script than left buried in one repo.`,
  },

  // ---------------------------------------------------------------- zelda_quiz
  {
    title: 'Weighted Multi-Choice Quiz Scoring Engine',
    category: 'treasure',
    summary: 'A data-driven "which character are you" scoring pattern: question -> answer -> per-category point weights, decoupled from view logic.',
    tags: ['python', 'django', 'algorithms', 'repo:zelda-quiz'],
    content: `A reusable personality-quiz scoring pattern, kept entirely in data rather
than branching logic:

\`\`\`python
# quiz/views.py
def calculate_results(post_data):
    scores = build_empty_scores()
    for question in QUESTIONS:
        answer = post_data.get(question["id"])
        if not answer:
            continue
        for character, points in SCORING[question["id"]].get(answer, {}).items():
            scores[character] += points
    winner_slug = max(scores, key=scores.get)
    total_points = sum(scores.values()) if sum(scores.values()) &gt; 0 else 1
    return winner_slug, scores, total_points
\`\`\`

\`SCORING\` is a plain dict mapping \`question_id -&gt; answer -&gt; {character:
points}\` — adding a new question or category means editing data, not
control flow. Note the safe-division guard: \`total_points\` falls back to \`1\`
if nothing was answered, avoiding a divide-by-zero when computing
percentage breakdowns.

**When to reach for this:** any "quiz that sorts you into a category" — a
BuzzFeed-style personality test, a placement quiz, a recommendation quiz.
The data/logic split (content lives in dicts, scoring is one small generic
function) means the same engine works for a completely different quiz just
by swapping the \`QUESTIONS\`/\`SCORING\` data.`,
  },
  {
    title: 'Session-as-State-Store Instead of Database Persistence',
    category: 'weapons',
    summary: 'Post/Redirect/Get with results kept in the session, not written to a database, for ephemeral per-user results.',
    tags: ['django', 'sessions', 'pattern', 'repo:zelda-quiz'],
    content: `When a result doesn't need to outlive the browsing session, don't write it
to a database at all — stash it in the session and redirect:

\`\`\`python
# quiz/views.py
def quiz_view(request):
    if request.method == "POST":
        answers = {q["id"]: request.POST.get(q["id"]) for q in QUESTIONS}
        request.session["quiz_answers"] = answers
        return redirect("result")           # POST -> redirect -> GET
    return render(request, "quiz/quiz.html", {"questions": QUESTIONS})

def result_view(request):
    answers = request.session.get("quiz_answers")
    if not answers:
        return redirect("quiz")             # no answers in session -> back to start
    ...
\`\`\`

This is the standard **Post/Redirect/Get** pattern (avoids "resubmit form?"
on refresh) combined with using the session itself as the transient data
store — no \`QuizResult\` table, no rows to clean up, no persistence for data
that only matters for one visit.

**When to reach for this:** any flow where a result page needs the previous
step's data but that data has no long-term value — a quiz, a calculator, a
multi-step form's confirmation page. Skip the database round-trip and the
cleanup-job problem it creates; the session already is a
per-user store.`,
  },

  // ---------------------------------------------------------------- trial_of_the_falling_stones
  {
    title: 'Arcade View-Based Game State Machine (Menu / Playing / Game Over)',
    category: 'weapons',
    summary: 'Each game screen is its own class with its own draw/update/input, swapped via show_view() instead of an if-state branch tree.',
    tags: ['python', 'arcade', 'game-dev', 'repo:trial-of-the-falling-stones'],
    content: `Using the \`arcade\` library's \`View\` class, each screen (menu, gameplay,
eventually game-over) is a separate class implementing its own \`on_draw\`,
\`on_update\`, and \`on_key_press\` — transitions are just a method call:

\`\`\`python
# game/menu_view.py
def on_key_press(self, key, modifiers):
    if key == arcade.key.ENTER:
        game_view = GameView()
        game_view.setup()
        self.window.show_view(game_view)
\`\`\`

Compare this to the common beginner pattern of one giant update/draw method
with \`if self.state == "menu": ... elif self.state == "playing": ...\`
branches everywhere — the \`View\`-per-screen approach keeps each screen's
logic, input handling, and drawing fully self-contained, and adding a new
screen (pause menu, game-over screen, settings) means adding a new class,
not threading a new branch through every existing method.

**Generalizes beyond Arcade:** this is the standard game-state-machine shape
— useful in any engine (Pygame, Godot, Unity) that doesn't hand you a scene
graph for free. If a game loop ever starts accumulating \`if state ==\`
branches, this is the refactor to reach for.`,
  },
  {
    title: 'Frame-Rate-Independent Spawn Timer + Sprite-List Collision',
    category: 'treasure',
    summary: 'Accumulate delta_time to fire spawns at a fixed real-world interval regardless of framerate, and use built-in sprite-list collision instead of manual AABB math.',
    tags: ['python', 'arcade', 'game-dev', 'repo:trial-of-the-falling-stones'],
    content: `**Spawn timer**, accumulated from \`delta_time\` rather than counting frames —
stays correct regardless of framerate:

\`\`\`python
# game/game_view.py
self.spawn_timer += delta_time
if self.spawn_timer &gt; 0.7:
    self.stone_list.append(Stone(self.stone_speed))
    self.spawn_timer = 0
self.stone_speed += STONE_ACCELERATION   # smooth difficulty ramp, every frame
\`\`\`

**Collision**, using Arcade's built-in spatial check instead of hand-rolled
bounding-box math:

\`\`\`python
hit_list = arcade.check_for_collision_with_list(self.player, self.stone_list)
for stone in hit_list:
    stone.remove_from_sprite_lists()
    self.health -= 1
    arcade.play_sound(self.hit_sound)
\`\`\`

**Two generalizable pieces:** (1) the accumulate-then-fire-at-threshold
timer pattern is the correct way to do "every N seconds" in any real-time
loop with a variable \`delta_time\` — counting frames instead breaks the
moment framerate changes. (2) \`check_for_collision_with_list(sprite,
sprite_list)\` is a drop-in for "one object vs. many" collision (bullets,
pickups, hazards) in any Arcade project — no reason to hand-write AABB
overlap checks when the engine already does it.`,
  },

  // ---------------------------------------------------------------- zelda-adventure
  {
    title: 'Decoupled Turn-Based Combat Resolver',
    category: 'weapons',
    summary: 'Combat logic as a pure function taking two combatants, separate from menu/exploration flow control — easy to test in isolation.',
    tags: ['java', 'game-dev', 'architecture', 'repo:zelda-adventure'],
    content: `A console-based RPG's combat is isolated into a single static method,
completely decoupled from the menu-driven exploration loop:

\`\`\`java
// src/engine/CombatEngine.java
public static boolean fight(Player player, Enemy enemy) {
    while (player.isAlive() &amp;&amp; enemy.isAlive()) {
        enemy.takeDamage(player.attack());
        if (!enemy.isAlive()) return true;
        player.takeDamage(enemy.attack());
    }
    return false;
}
\`\`\`

It takes two "combatant" objects, alternates attacks, and returns a boolean
outcome — no I/O, no reference to the surrounding game loop or console
state. \`GameEngine\` calls into it and only handles the surrounding narrative
(printing outcomes, awarding loot).

**Why this is worth copying:** a pure function with no I/O and no hidden
state is trivially unit-testable — feed it two known combatants, assert the
winner — even though the rest of the game is a stateful console loop with no
tests at all. Any turn-based system (auto-battler, roguelike, card game)
benefits from isolating "resolve one exchange between two entities" as a
pure function separate from the flow control that decides *when* to call
it.`,
  },
  {
    title: 'Centralized RNG Service with Semantic Probability Helper',
    category: 'treasure',
    summary: 'One shared Random instance behind a chance(percent) helper, instead of scattering `new Random()` calls and raw nextInt() math.',
    tags: ['java', 'utilities', 'repo:zelda-adventure'],
    content: `All randomness in the game — loot drops, enemy selection, percentage-based
chance checks — funnels through one service wrapping a single \`Random\`
instance:

\`\`\`java
// src/services/RandomService.java
public boolean chance(int percent) {
    return random.nextInt(100) &lt; percent;
}

public Enemy randomEnemy() {
    String name = names[random.nextInt(names.length)];
    int health = 10 + random.nextInt(6);
    return new Enemy(name, health);
}
\`\`\`

**Two reasons to copy this shape:** first, \`chance(percent)\` reads like the
English sentence it represents ("30% chance to...") at every call site,
instead of \`random.nextInt(100) &lt; 30\` scattered and re-derived everywhere.
Second, centralizing to one \`Random\` instance avoids a subtle class of bugs
where multiple \`new Random()\` calls created close together in time can
produce correlated/identical sequences on some JVMs (same default seed
source).

Drop-in reusable for any game or simulation needing readable, centralized
randomness.`,
  },
  {
    title: 'Java Scanner nextInt() Trailing-Newline Buffer Bug',
    category: 'creatures',
    summary: 'The classic Scanner.nextInt() then nextLine() gotcha — nextInt() leaves the newline in the buffer, so the next nextLine() reads empty.',
    tags: ['java', 'bug', 'gotcha', 'repo:zelda-adventure'],
    content: `**The trap:** \`Scanner.nextInt()\` reads the integer token but leaves the
trailing newline character in the input buffer. If the very next call is
\`scanner.nextLine()\` (expecting to read a fresh line of input), it instead
immediately returns an empty string — the leftover newline — instead of
waiting for real input. This is one of the most common early-Java bugs, and
it's easy to hit again even knowing about it once, because the failure is
silent (no exception, just an unexpectedly empty string).

**Fix used here** — wrap it once, in a shared input service, so it can never
be gotten wrong at a call site again:

\`\`\`java
// src/services/InputService.java
public int nextInt() {
    int value = scanner.nextInt();
    scanner.nextLine(); // clears the leftover newline from the buffer
    return value;
}
\`\`\`

**Lesson:** rather than remembering to call \`scanner.nextLine()\` defensively
after every \`nextInt()\` call throughout a codebase, wrap the raw
\`Scanner\` in a single input service and fix the bug once, at the source.
Worth grepping for raw \`Scanner\` usage mixing \`nextInt()\`/\`nextLine()\` in any
future console-input Java program — this bug reappears constantly in fresh
code that isn't going through a wrapper.`,
  },

  // ---------------------------------------------------------------- campus_events
  {
    title: 'Static JSON + localStorage as a No-Backend Data Layer',
    category: 'weapons',
    summary: 'Treating localStorage as a write layer on top of read-only seed JSON, so a static site can accept user-generated content with zero server.',
    tags: ['javascript', 'localstorage', 'no-backend', 'repo:campus-events'],
    content: `A pattern for accepting user-generated content on a purely static site with
no backend at all — read-only seed data ships as JSON, and anything the user
adds layers on top from \`localStorage\`:

\`\`\`js
// js/events.js
export async function getEvents() {
  const response = await fetch("./data/events.json");
  const jsonEvents = await response.json();
  const userEvents = JSON.parse(localStorage.getItem("userEvents")) || [];
  return [...jsonEvents, ...userEvents];
}
\`\`\`

Every read merges both sources; every write from a "new event" form only
ever touches \`localStorage\`, leaving the shipped JSON untouched as the
baseline. Combined with **URL-param-based routing** for a multi-page site
without a router library:

\`\`\`js
// js/router.js
export function goToEvent(id) { location.href = \\\`event.html?id=\\\${id}\\\`; }
export function getEventId() { return new URLSearchParams(location.search).get("id"); }
\`\`\`

**When to reach for this combo:** any small static site (portfolio,
directory, catalog) that needs to feel dynamic — accept new entries,
persist a user's additions — without standing up a server or database.
It's inherently single-browser/single-device (no sync), but for a demo, a
personal tool, or a course project, that tradeoff is usually fine and the
zero-infrastructure cost is worth it.`,
  },
  {
    title: 'Vanilla-JS localStorage Utility Patterns (Theme Toggle + Namespaced Keys)',
    category: 'treasure',
    summary: 'Two small, portable localStorage idioms: an attribute-driven dark-mode toggle, and namespaced per-record keys for form state.',
    tags: ['javascript', 'localstorage', 'ui', 'repo:campus-events'],
    content: `**Dark-mode toggle**, persisted and driven by a \`data-theme\` attribute (so
CSS just keys off the attribute, no JS-managed class list):

\`\`\`js
// js/navbar.js
themeToggle.addEventListener("click", () =&gt; {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
  localStorage.setItem("theme", isDark ? "light" : "dark");
});
\`\`\`

**Namespaced per-record keys**, so form state for *each* record (here, an
RSVP per event) persists independently instead of one shared blob:

\`\`\`js
// js/storage.js
const key = (eventId) =&gt; \\\`rsvp_\\\${eventId}\\\`;
\`\`\`

Revisiting an event page later re-populates the RSVP form from its own
namespaced key — no cross-talk between different events' saved state.

**Why both are worth keeping as reference:** the attribute-driven theme
toggle is the standard, portable dark-mode pattern (works with plain CSS
\`[data-theme="dark"]\` selectors, no framework needed — this is the same
mechanism the Compendium's own theming uses). The namespaced-key pattern
generalizes to any "remember per-item state without a database" need —
draft text per form, expanded/collapsed state per card, etc.`,
  },

  // ---------------------------------------------------------------- Zelda_Compendium
  {
    title: 'Hand-Rolled SPA Router via URLSearchParams + pushState',
    category: 'weapons',
    summary: 'Full client-side master/detail routing with no framework and no build step — the vanilla-JS ancestor of the server-rendered Compendium.',
    tags: ['javascript', 'spa', 'routing', 'repo:zelda-compendium'],
    content: `An earlier, client-only Zelda compendium (fetching from a public REST API)
implements the exact same "list of entries -&gt; click one -&gt; see detail"
shape this app now implements server-side — but entirely in vanilla JS with
no framework or build step:

\`\`\`js
// js/main.js
export async function router() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") || "game";
  const id = params.get("id");

  if (type === "game") {
    const game = await fetchGameByName("Twilight Princess");
    renderGame(game);
    const [bosses, enemies, items] = await Promise.all([
      fetchEntitiesByGame("bosses", game.id),
      fetchEntitiesByGame("enemies", game.id),
      fetchEntitiesByGame("items", game.id),
    ]);
    renderList(bosses, "#bosses", "boss");
    // ...
  } else {
    // type === "boss" | "enemy" | "item": fetch single entity, render detail
  }
}
window.addEventListener("popstate", router);
router();
\`\`\`

\`?type=&amp;id=\` as the URL shape is a direct conceptual match for
\`/categories/:slug\` and \`/entries/:slug\` in the server-rendered app — same
routing problem, solved client-side with the History API instead of Express
routes. \`Promise.all\` fans out the three category fetches in parallel rather
than sequentially awaiting each.

**Worth keeping as a reference:** this is the pattern to reach for on any
future no-build, no-framework SPA that needs master/detail navigation —
query-string state + \`pushState\`/\`popstate\` gets real back-button-correct
client routing for free, no router library required.`,
  },
  {
    title: 'API Inconsistency Normalization Idiom',
    category: 'creatures',
    summary: 'A defensive one-liner for working around a third-party API that uses different field names for conceptually the same relationship across endpoints.',
    tags: ['javascript', 'api-integration', 'defensive-coding', 'repo:zelda-compendium'],
    content: `**The problem:** the public Zelda API returns different field names for
"which games this entity appears in" depending on entity type — bosses/
enemies use \`appearances\`, items use \`games\`. Code written against one shape
silently breaks (returns \`undefined\`, filters everything out) when fed the
other.

**Fix:**

\`\`\`js
// js/api/fetchEntitiesByGame.js
// handle API inconsistency: some endpoints use 'appearances', items use 'games'
return json.data.filter((entity) =&gt; {
  const links = entity.appearances || entity.games;
  return links?.some((url) =&gt; url.includes(gameId));
});
\`\`\`

A one-line "try field A, fall back to field B" normalization, applied right
at the API boundary, so nothing downstream needs to know the inconsistency
exists.

**Lesson:** third-party APIs are rarely perfectly consistent across their
own endpoints — normalize at the integration boundary (one function, one
place) rather than letting every consumer of the data defensively check
both field names. When integrating any new external API, watch for exactly
this shape of inconsistency between conceptually-similar endpoints, and fix
it once at the fetch layer.`,
  },

  // ---------------------------------------------------------------- VoiceRecorder
  {
    title: 'Recording Audio with MediaRecorder (+ Runtime Permission Request)',
    category: 'treasure',
    summary: 'The complete minimal recipe for requesting RECORD_AUDIO and recording mic input to a file on Android.',
    tags: ['android', 'kotlin', 'media', 'repo:voicerecorder'],
    content: `**Requesting the dangerous permission** — the canonical
\`checkSelfPermission\`/\`requestPermissions\` pair, reusable verbatim for any
dangerous permission (camera, location, contacts):

\`\`\`kotlin
if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
    != PackageManager.PERMISSION_GRANTED) {
    ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), 0)
}
\`\`\`

**Recording to a file** — the complete \`MediaRecorder\` setup:

\`\`\`kotlin
// RecordActivity.kt
filePath = "\\\${getExternalFilesDir(null)?.absolutePath}/rec_\\\${System.currentTimeMillis()}.3gp"
recorder = MediaRecorder().apply {
    setAudioSource(MediaRecorder.AudioSource.MIC)
    setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP)
    setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB)
    setOutputFile(filePath)
    prepare()
    start()
}
// ...
recorder?.stop()
recorder?.release()   // don't skip this — leaks the recorder if omitted
recorder = null
\`\`\`

Uses \`getExternalFilesDir(null)\` (app-private external storage) rather than
\`MediaStore\`/\`ContentResolver\` — simpler, and no extra storage permission
needed on modern SDKs, at the cost of the files not being visible to other
apps or a file manager.

**One gap worth flagging, not copying:** this implementation doesn't
override \`onRequestPermissionsResult\` to confirm the permission was actually
granted before recording — if a user denies it, recording can silently fail.
Any reuse of this pattern should add that check.`,
  },
  {
    title: 'Filesystem-as-Database for Simple Media Apps',
    category: 'weapons',
    summary: 'Skip Room/ContentResolver entirely — treat the app\'s own storage directory as the source of truth by just listing files.',
    tags: ['android', 'kotlin', 'architecture', 'repo:voicerecorder'],
    content: `Listing saved recordings doesn't go through a database or content
provider at all — it just reads the directory:

\`\`\`kotlin
// RecordingsActivity.kt
val files = getExternalFilesDir(null)?.listFiles()?.toList() ?: emptyList()
\`\`\`

Each item plays back via a fresh \`MediaPlayer\`, released on completion:

\`\`\`kotlin
// RecordingsAdapter.kt
val player = MediaPlayer()
player.setDataSource(file.absolutePath)
player.prepare()
player.start()
player.setOnCompletionListener { holder.text.text = file.name; player.release() }
\`\`\`

**Why this is a legitimate architecture, not just a shortcut:** for an app
where "the files themselves" already are the complete record — no metadata
beyond filename/timestamp needed — a Room database or \`ContentResolver\`
integration is pure overhead. The filesystem already provides listing,
existence checks, and stable identity (the path) for free.

**When to graduate off this pattern:** the moment the app needs metadata
that isn't derivable from the file itself (custom titles, tags, favorites,
play counts) or needs to expose recordings to other apps via
\`MediaStore\`/scoped storage — at that point a real content layer earns its
complexity. Until then, "just list the directory" is the right amount of
architecture for a two-screen utility app.`,
  },
];

async function main() {
  for (const e of entries) {
    const { rows: catRows } = await pool.query('SELECT id FROM categories WHERE slug = $1', [e.category]);
    const categoryId = catRows[0]?.id || null;

    const baseSlug = slugify(e.title);
    let slug = baseSlug;
    let n = 1;
    for (;;) {
      const { rows } = await pool.query('SELECT id FROM entries WHERE slug = $1', [slug]);
      if (rows.length === 0) break;
      n += 1;
      slug = `${baseSlug}-${n}`;
    }

    const { rows } = await pool.query(
      `INSERT INTO entries (title, slug, category_id, summary, content)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, slug`,
      [e.title, slug, categoryId, e.summary, e.content]
    );
    const entryId = rows[0].id;

    for (const tagName of e.tags) {
      const { rows: tagRows } = await pool.query(
        `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tagName]
      );
      await pool.query(
        'INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [entryId, tagRows[0].id]
      );
    }

    console.log(`Inserted: ${e.title} -> /entries/${rows[0].slug}`);
  }

  // Cross-link the FocusTracker timer entry to Quest's realtime-sync entry
  // (referenced by [[slug]] in the prose above).
  const { rows: fromRows } = await pool.query(
    "SELECT id FROM entries WHERE slug = 'server-authoritative-countdown-timer-absolute-timestamp-not-a-counter'"
  );
  const { rows: toRows } = await pool.query(
    "SELECT id FROM entries WHERE slug = 'supabase-realtime-cross-tab-sync-via-postgres-changes'"
  );
  if (fromRows.length && toRows.length) {
    await pool.query(
      'INSERT INTO entry_links (from_entry_id, to_entry_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [fromRows[0].id, toRows[0].id]
    );
  } else {
    console.warn('Skipped cross-link: slug not found, check exact slugify output');
  }

  console.log('Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
