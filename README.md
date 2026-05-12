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
- `/define [text]` — show a definition in an overlay without adding it to main chat context. With no text, reads the clipboard first, then prompts if the clipboard is unavailable/empty.
- `/edit-mode <request>` — ask the assistant to draft a patch without applying it.
- `/edit-mode apply` — explicitly approve applying the previously drafted patch.

## Behavior

While learning mode is active, the extension:

- injects tutor-mode instructions into the agent context,
- prefers one small learner-owned next step at a time,
- keeps all external/research tools available (for example web/code search, fetch tools, MCP tools, `gh`, `curl`, or small URL-fetch scripts) without requiring extra permission,
- blocks `edit`, `write`, and mutating bash commands by default, while allowing user-requested comment-only edits that add/refine explanations without changing executable code,
- transforms readiness signals like `done`, `review`, or `I tried it` into review prompts,
- asks the assistant to inspect relevant files/diffs before reviewing,
- supports `/define` and `ctrl+shift+d` definition overlays,
- leaves native terminal mouse selection/scrollback behavior alone by default, and
- supports an explicit two-step edit-mode escape hatch for broader code changes.

Tip: select/copy terminal text normally, then run `/define` to define the clipboard contents. The old drag-to-define mouse capture is opt-in via `PI_LEARNING_TUTOR_MOUSE_CAPTURE=1` because it can break mouse-wheel scrollback.

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the original implementation checklist.
