# Learning Tutor Extension — Implementation Tickets

## MVP tickets

1. **Learning mode shell**
   - Add `/learn <anything>` and use `/learn off` as the only stop command.
   - Persist lightweight per-session state.
   - Show a learning-mode status indicator.
   - Inject tutor-mode system/context instructions while active.
   - Require concept-first tutoring: before learner-owned typing steps, show the concepts and why the code/command matters.

2. **Hard learning gate**
   - Disable/avoid mutating tools while learning mode is active.
   - Block `edit`/`write` tool calls except user-requested comment-only explanatory edits that leave executable code unchanged.
   - Block mutating bash commands; allow bounded local inspection and full external/research tool access.

3. **Learner-signal review loop**
   - Detect readiness signals like `done`, `review`, `I tried it`.
   - Transform them into review instructions for the tutor.
   - Guide the tutor to inspect `git status`, `git diff`, and relevant files before giving the next step.

4. **Command surface**
   - `/exercise [topic]` for a context-calibrated build challenge based on recent commits/diffs, the issue at hand, or an explicit topic, requiring the learner to build a new scoped artifact that demonstrates the concepts being assessed.
   - `/review [scope]` for broader/manual review such as commit history.
   - `/define <text>` for fallback definitions outside the main conversation.
   - `/act <request>` for fire-and-forget scoped code changes.

5. **Definition overlay**
   - Implement `/define <text>` using the active model directly from the extension.
   - Render the result in a Pi overlay, not as a normal chat message.
   - Add a keyboard shortcut fallback for quick definitions.
   - Preserve native terminal text selection/copy/scroll behavior; keep drag-to-define mouse capture opt-in only.
   - When `/define` is run without arguments, read clipboard text first and fall back to prompting.
   - Make definition overlays scrollable with ↑/↓, PgUp/PgDn, j/k, and Space.

6. **Act escape hatch**
   - `/act <request>` immediately unlocks mutating tools for one scoped execution turn.
   - No draft/apply confirmation loop.
   - Automatically return to learning mode after the execution turn.

## Follow-up investigations

- Investigate optional drag-to-define only if Pi exposes a first-class terminal selection API that does not hijack scrollback.
- Improve bash read-only classification.
- Add richer custom renderers for tutor steps/reviews.
- Add optional glossary/profile later, behind explicit user opt-in.
