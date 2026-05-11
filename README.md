# Pi Learning Tutor

A pi extension that turns a conversation into a learner-owned tutoring thread. It emphasizes concept-first explanations, blocks AI-authored edits by default, reviews learner attempts with bounded read-only inspection, and provides quick definition overlays.

## Install

```bash
pi install npm:@majorgilles/pi-learning-tutor
```

For a one-off run without adding it to settings:

```bash
pi -e npm:@majorgilles/pi-learning-tutor
```

## Commands

- `/learn <anything>` — start learning mode with arbitrary context.
- `/learn done`, `/learn off`, `/learn stop` — leave learning mode.
- `/exercise [topic]` — generate a small context-relevant practice exercise without the solution.
- `/review [scope]` — request a broader learning review.
- `/define <text>` — show a definition in an overlay without adding it to main chat context.
- `/edit-mode <request>` — ask the assistant to draft a patch without applying it.
- `/edit-mode apply` — explicitly approve applying the previously drafted patch.

## Behavior

While learning mode is active, the extension:

- injects tutor-mode instructions into the agent context,
- prefers one small learner-owned next step at a time,
- keeps all external/research tools available (for example web/code search, fetch tools, MCP tools, `gh`, `curl`, or small URL-fetch scripts) without requiring extra permission,
- blocks `edit`, `write`, and mutating bash commands by default,
- transforms readiness signals like `done`, `review`, or `I tried it` into review prompts,
- asks the assistant to inspect relevant files/diffs before reviewing,
- supports `/define` and `ctrl+shift+d` definition overlays,
- enables left-drag term selection in Pi's live TUI viewport for quick definitions or copying selected text to the clipboard only while learning mode is active, and
- supports an explicit two-step edit-mode escape hatch.

Note: left-drag definition popups work inside Pi's active TUI viewport. Native terminal scrollback is handled by the terminal emulator and does not deliver mouse events to Pi extensions; copy scrollback text and use `/define <text>` instead.

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the original implementation checklist.
