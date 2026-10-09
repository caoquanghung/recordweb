---
trigger: always_on
---

# Memory Management & State Synchronization Rules

## 1. Purpose of the Memory File

The file [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md) serves as the persistent, single-source-of-truth memory bank for AI agents across conversations and coding sessions. It guarantees continuity, prevents redundant work, and preserves crucial technical context.

---

## 2. Trigger Events: When to Update Memory

Agents operating in this repository **MUST** review and update `MEMORY.md` upon any of the following trigger events:

1. **Milestone or Phase Completion**:
   * When a development phase or major feature (e.g., Canvas Compositor, Audio Filters, WebM Duration Repair) is implemented and verified.
   * Action: Mark the corresponding checklist item `[x]` in Section 4, summarize accomplishments, and update Section 6 (*Immediate Next Steps*).
2. **Architectural Pivots or Key Technical Decisions**:
   * When a library, API design, database schema, or third-party service integration is decided, modified, or replaced.
   * Action: Document the decision and rationale under Section 2 (*Key Architectural Decisions & Invariants*).
3. **Discovery of Bugs, Browser Quirks, or Gotchas**:
   * When discovering a non-obvious browser-specific issue (e.g. MediaStream locks, AudioContext suspend states, WebM duration NaN, Vercel payload limits).
   * Action: Add the quirk, its impact, and the verified workaround to Section 5 (*Known Gotchas & Browser Quirks*).
4. **User Preferences & Constraint Changes**:
   * When the user specifies new styling preferences, modifies stack choices, or adjusts performance thresholds.
   * Action: Update Section 1 (*Project Snapshot*) and Section 2.
5. **Session Wrap-Up**:
   * Before concluding a complex pair-programming session, ensure Section 6 clearly points to the immediate next task so subsequent agent runs can resume immediately without re-exploration.

---

## 3. Formatting & Content Invariants

When editing `MEMORY.md`, agents must adhere to the following rules:

1. **Conciseness over Verbosity**:
   * Use bullet points, concise tables, and short summaries.
   * Do NOT paste full code blocks or logs into `MEMORY.md`. Provide file paths and symbol references instead (e.g., `src/modules/compositor.js`).
2. **Zero Credentials Policy**:
   * NEVER write live database connection passwords, API keys, or JWT tokens into `MEMORY.md`. Only document variable names (e.g. `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`).
3. **Prune Obsolete State**:
   * Keep the *Immediate Next Steps* section focused on the 2–3 immediate priority tasks.
   * Do not let completed tasks clutter the active tasks list; move them to the roadmap progress checklist.
4. **Atomic Updates**:
   * Use targeted file edits (`replace_file_content`) to update specific sections of `MEMORY.md` without rewriting the entire document, preserving existing notes.

---

## 4. First Action on Session Startup

At the beginning of any new conversation or after resuming work:
1. Agents must check [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md) to inspect:
   - What phase the project is currently in.
   - What immediate next step is pending.
   - Any known gotchas relevant to the current task.
