# Learning Tutor Extension — Implementation Tickets

## MVP tickets

1. **Learning mode shell**
   - Add `/learn <anything>`, `/learn done`, `/learn off`.
   - Persist lightweight per-session state.
   - Show a learning-mode status indicator.
   - Inject tutor-mode system/context instructions while active.
   - Require concept-first tutoring: before learner-owned typing steps, show the concepts and why the code/command matters.

2. **Hard learning gate**
   - Disable/avoid mutating tools while learning mode is active.
   - Block `edit`/`write` tool calls.
   - Block mutating bash commands; allow bounded local inspection and full external/research tool access.

3. **Learner-signal review loop**
   - Detect readiness signals like `done`, `review`, `I tried it`.
   - Transform them into review instructions for the tutor.
   - Guide the tutor to inspect `git status`, `git diff`, and relevant files before giving the next step.

4. **Command surface**
   - `/exercise [topic]` for context-relevant practice, including the concepts being practiced and why they matter.
   - `/review [scope]` for broader/manual review such as commit history.
   - `/define <text>` for fallback definitions outside the main conversation.
   - `/edit-mode` for explicit two-step patch approval.

5. **Definition overlay**
   - Implement `/define <text>` using the active model directly from the extension.
   - Render the result in a Pi overlay, not as a normal chat message.
   - Add a keyboard shortcut fallback for quick definitions.
   - Preserve native terminal text selection/copy behavior; do not enable mouse capture for drag-to-define.
   - When `/define` is run without arguments, read clipboard text first and fall back to prompting.
   - Make definition overlays scrollable with ↑/↓, PgUp/PgDn, j/k, and Space.

6. **Edit mode escape hatch**
   - Draft-only first step.
   - `/edit-mode apply` unlocks mutating tools for one apply turn.
   - Automatically return to learning mode after the apply turn.

## Follow-up investigations

- Improve selection UX/visual highlighting if Pi exposes a first-class terminal selection API later.
- Improve bash read-only classification.
- Add richer custom renderers for tutor steps/reviews.
- Add optional glossary/profile later, behind explicit user opt-in.
