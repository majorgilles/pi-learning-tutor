# Pi Learning Tutor

A pi extension that turns a conversation into a learner-owned tutoring thread. It emphasizes concept-first explanations, blocks AI-authored edits by default, reviews learner attempts with bounded read-only inspection, and provides quick definition overlays.

## Install

```bash
pi install git:github.com/majorgilles/pi-learning-tutor
```

For a one-off run without adding it to settings:

```bash
pi -e git:github.com/majorgilles/pi-learning-tutor
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
- blocks `edit`, `write`, and mutating bash commands by default,
- transforms readiness signals like `done`, `review`, or `I tried it` into review prompts,
- asks the assistant to inspect relevant files/diffs before reviewing,
- supports `/define` and `ctrl+shift+d` definition overlays, and
- supports an explicit two-step edit-mode escape hatch.

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the original implementation checklist.
