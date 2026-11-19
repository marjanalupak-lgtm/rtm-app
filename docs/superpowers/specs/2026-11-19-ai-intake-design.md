# AI intake: turn raw input into structured requirements

## Intent
Requirements arrive as messy material: notes, pasted emails, PDFs/RFPs, screenshots, meeting transcripts.
Today the user retypes them into the RTM by hand. The **AI** button takes that material, has Claude
break it into requirements that fit this project's structure (types, areas, IDs, parents), checks them
against what already exists, and shows a summary plus a proposed plan. Nothing is written until the
user accepts it.

## Goals
- One **AI** button in the RTM toolbar (next to "+ Requirement"), for users who can edit the project.
- Input: typed or pasted text, plus files: PDF, images (PNG/JPG/WebP/GIF), text-like files
  (.txt, .md, .vtt, .srt, .csv), Word (.docx), Excel (.xlsx/.xlsm/.csv).
- Output, reviewed before anything is saved:
  - **Summary**: what the material is about, in a few sentences.
  - **Proposals**, each flagged:
    - `new`: a new requirement (type, area, statement, acceptance criteria, parent, priority, category).
    - `update`: a change to an existing requirement (which fields and why).
    - `duplicate`: already covered by an existing ID (shown, not added).
    - `conflict`: contradicts an existing requirement (shown with both texts).
  - **Structure suggestions**: e.g. a new Business/Stakeholder branch for new proposals, or a new area.
  - **Open questions** and **recommended next steps**.
- The user ticks which proposals to apply, can edit the text, and clicks **Apply**. New requirements get
  IDs from the project's ID structure (Settings › IDs). Parents can point to existing IDs or to other
  new proposals in the same batch.

## Non-goals (for now)
- Audio: no voice dictation, no call-recording transcription (paste a transcript instead).
- No chat / back-and-forth; one run per input (the user can edit the input and run again).
- No automatic saving, no background processing.
- No shared team key or server (see Approaches).

## Anti-goals
- AI silently overwriting or deleting existing requirements.
- Proposals that ignore the project's types, areas, or ID structure.
- The API key ending up in Google Drive, the sheet, the export, or the git repo.

## Constraints
- Static app on GitHub Pages; data in the user's Google Sheets. No backend.
- Claude Messages API called from the browser with the user's own key.
- Request limit 32 MB; PDFs up to 600 pages. Large inputs are refused with a clear message, never cut silently.
- The project has ~250 requirements; the existing set is sent as context on every run.
- Material (and requirement text) is sent to Anthropic: the UI says so.

## Approaches
1. **Own key in the browser (chosen).** Each user pastes an Anthropic API key in Settings › AI; it is
   stored in this browser only (localStorage) and used by the official SDK with
   `dangerouslyAllowBrowser: true`. Fastest; no new services; cost shows on the user's own account.
   Downside: every team member needs a key; key lives in the browser.
2. **Proxy (Cloudflare Worker) with one team key.** Safer and no per-user keys, but needs a Cloudflare
   account and upkeep. Deferred: the AI module calls one function (`runIntake`), so the transport can
   be swapped later without UI changes.
3. Claude through a claude.ai subscription: not possible from a web app.

The user picked 1, and "no audio for now".

## How it works

### Settings › AI (per browser)
- Field: "Anthropic API key" (password input) + **Test key** (cheap request) + **Remove key**.
- Stored in `localStorage['rtm.ai.key']` only. Text: "Stored only in this browser. Not saved to the project or Drive."
- Link to console.anthropic.com to create a key; note that each run is billed to that key.

### The AI panel
Opens as a large panel over the RTM (like a modal, full height). Two steps:

**1. Input**
```
┌ AI intake ─────────────────────────────────────────────┐
│ Paste or type…                                          │
│ [ big text area                                       ] │
│ [+ Add files]  rfp.pdf ×  whiteboard.jpg ×  call.vtt ×  │
│ Context sent: 241 requirements, ID structure, lists     │
│ ⓘ Your text and files are sent to Anthropic (Claude).   │
│                                  [Cancel] [Analyse ▶]   │
└─────────────────────────────────────────────────────────┘
```
- .docx is read to text in the browser (`mammoth`); .xlsx/.csv to CSV text with the existing `xlsx` lib;
  PDFs and images go as native document/image blocks; text files as text.
- While running: progress text ("Reading 3 files…", "Claude is analysing…") and a Cancel.

**2. Review**
```
┌ Summary ───────────────────────────────────────────────┐
│ 3–5 sentences.  12 new · 2 updates · 3 duplicates · 1 conflict │
├ Structure suggestions ─────────────────────────────────┤
│ • New branch: SR "Sites can export audit trail" under ST-BR-04 │
├ Proposals ─────────────────────────────────────────────┤
│ ☑ NEW  Functional · PA → ST-FR-… ID shown on apply      │
│    "As a participant I want…"  [edit]  parent: PA-SR-12 │
│    why: from p.4 of rfp.pdf                             │
│ ☑ UPDATE ST-FR-014  acceptance: + "…"   [show diff]     │
│ ☐ DUPLICATE of PA-FR-022 (not added)                    │
│ ☐ CONFLICT with ST-NFR-003: 15 vs 30 min timeout        │
├ Open questions / next steps ───────────────────────────┤
│                         [Back] [Apply 14 selected]      │
└─────────────────────────────────────────────────────────┘
```
- Defaults: `new` and `update` ticked; `duplicate` and `conflict` unticked (conflict can be ticked to
  apply its suggested change).
- Each card can be edited inline (statement, acceptance, type, area, parent, priority).
- Filter chips at the top: All / New / Update / Duplicate / Conflict.

### Apply
- New requirements: ID = next free ID for type + area (`nextSchemeId`), or the project prefix when IDs
  are not structured. Created in batch order so parents created in the same batch exist first.
  Fields: status = workflow initial status, date added = today, source = "AI intake <date>" (or what
  Claude extracted, e.g. a stakeholder name), notes = the source excerpt + reason.
- Updates: `saveReq` with the changed fields (normal history entry, action `ai-update`).
- Written with the existing bulk save; history action `ai-intake`.
- After apply: table reloads, a snackbar says "Added 12, updated 2".

### Claude call
- SDK `@anthropic-ai/sdk`, model `claude-opus-5-5`, streaming with `finalMessage()`, `max_tokens` 32000,
  `output_config: { effort: "high", format: { type: "json_schema", schema } }`, server-side refusal
  fallbacks (`fallbacks: "default"`).
- System prompt (stable, cached): what an RTM is here (BABOK levels Business → Stakeholder →
  Functional / Non-functional / Transition; parent links; acceptance criteria style), the project's
  lists, types, areas and ID structure, and the existing requirements as compact lines
  (`ID | type | area | parent | statement`). Rules: never invent IDs for new items (use `tmp-1`…),
  point `parent` at an existing ID or a `tmp-` ID, mark duplicates/conflicts with the existing ID,
  quote the source for each proposal.
- User content: the files (document/image/text blocks) then the typed text.
- Output schema (JSON): `summary`, `counts`, `structure[]` (suggestion text + affected IDs),
  `proposals[]` (`kind`, `tmpId`, `existingId`, `type`, `area`, `parent`, `statement`, `acceptance`,
  `priority`, `category`, `changes{field: newValue}`, `source`, `reason`), `questions[]`, `nextSteps[]`.
- Errors: no key → open Settings › AI; 401 → "key invalid"; 429/overloaded → "try again in a minute";
  refusal → show the reason; too large → say which file to remove.

### Details settled after the builder check (my calls)
- **Required fields Claude can't know.** The Apply step shows one small row "For new requirements:
  Release, Owner, Source", prefilled (latest release in the list, the signed-in user, "AI intake
  <date>"). Claude may set Design required (Yes/No) and priority; Delivery = Not Started; status =
  the workflow's initial status. Other required fields left empty show as normal gaps.
- **What an update / ticked conflict may change:** statement, acceptance, priority, category, parent,
  notes. Never ID, type, area or status (those have rename and workflow rules; the user changes them
  in the form).
- **Saving:** new requirements in one batch write (bulk save with its own history action `ai-intake`);
  each update through `saveReq` (action `ai-update`), which refuses a row changed by someone since the
  analysis. A refused update is skipped, the rest still apply, and the result lists what was skipped.
- **Structure suggestions are text only.** A proposal that uses an area not in Settings › IDs is
  flagged "unknown area" and can't be applied until the user picks an existing area on the card.

## Decided by the user
- Integration with Claude; own key per browser (approach 1); no audio for now.

## My calls (correct me)
- Button label **AI**, in the RTM toolbar; hidden for read-only users.
- Model Claude Opus 5.5 at effort "high" (quality over cost for requirement analysis).
- Nothing saved without review; duplicates and conflicts unticked by default.
- Key stored only in localStorage; no "remember for team".
- Word support via one new dependency (`mammoth`); everything else uses what the app already has.

## Left to the builder
- Exact prompt wording and schema field names; panel layout details within UUI; how many proposals
  show before "show more"; test fixtures.
