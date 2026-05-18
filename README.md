# Pi Learning Tutor

A pi extension that turns a conversation into a learner-owned tutoring thread. It emphasizes gradual concept scaffolding, blocks AI-authored edits by default, reviews learner attempts with bounded read-only inspection, and provides quick definition overlays.

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
- `/exercise [topic]` — generate a context-calibrated build challenge based on the current learning context, recent commits/diffs, or issue/resources; no solution up front.
- `/review [scope]` — request a broader learning review.
- `/define [text]` — show a definition in an overlay without adding it to main chat context. With no text, reads the clipboard first, then prompts if the clipboard is unavailable/empty.
- `/copy-code [number]` — copy a raw code sample from the latest tutor response to the clipboard. Defaults to sample `1`.
- `/edit-mode <request>` — ask the assistant to draft a patch without applying it.
- `/edit-mode apply` — explicitly approve applying the previously drafted patch.

## Behavior

While learning mode is active, the extension:

- injects tutor-mode instructions into the agent context,
- prefers one small learner-owned next step at a time,
- introduces new terms through a short prerequisite ladder, defining mandatory concepts before relying on downstream jargon (for example, prediction/error before loss/gradient in basic ML),
- adds lightweight 30–90 second quick checks after key concepts when useful, evaluates learner answers supportively, and skips checks when they would interrupt flow,
- normalizes fenced code samples after tutor responses, shows them as terminal code cards, and supports `/copy-code` for copying raw code without UI indentation,
- treats `/exercise` as a larger context-aware build challenge command: it should inspect bounded evidence such as recent commits/diffs or the issue at hand, then ask the learner to build a new scoped artifact rather than make one tiny edit,
- keeps all external/research tools available (for example web/code search, fetch tools, MCP tools, `gh`, `curl`, or small URL-fetch scripts) without requiring extra permission,
- blocks `edit`, `write`, and mutating bash commands by default, while allowing user-requested comment-only edits that add/refine explanations without changing executable code,
- transforms readiness signals like `done`, `review`, or `I tried it` into review prompts,
- asks the assistant to inspect relevant files/diffs before reviewing,
- supports `/define` and `ctrl+shift+d` definition overlays,
- leaves native terminal mouse selection/scrollback behavior alone by default, and
- supports an explicit two-step edit-mode escape hatch for broader code changes.

Tip: select/copy terminal text normally, then run `/define` to define the clipboard contents. The old drag-to-define mouse capture is opt-in via `PI_LEARNING_TUTOR_MOUSE_CAPTURE=1` because it can break mouse-wheel scrollback.

## Development checks

```bash
npm install
npm run typecheck
npm pack --dry-run
```

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the original implementation checklist.

## License

This source is available under the [MIT License](./LICENSE).
