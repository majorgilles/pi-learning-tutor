# Pi Learning Tutor

A pi extension that turns a conversation into a learner-owned tutoring thread. It keeps the learner's why-level learning purpose visible, explains the now/later payoff in a beginner-friendly 3–4 line paragraph, emphasizes gradual concept scaffolding, blocks AI-authored edits by default, reviews learner attempts with bounded read-only inspection, and provides quick definition overlays.

## Install

```bash
pi install npm:@majorgilles/pi-learning-tutor
```

For a one-off run without adding it to settings:

```bash
pi -e npm:@majorgilles/pi-learning-tutor
```

## Commands

- `/learn <anything>` — start learning mode with arbitrary starting context; the why-level learning purpose is inferred and updated through the discussion.
- `/learn done`, `/learn off`, `/learn stop` — leave learning mode.
- `/exercise [topic]` — generate a context-calibrated build challenge based on the current learning context, recent commits/diffs, or issue/resources; no solution up front.
- `/review [scope]` — request a broader learning review.
- `/define [text]` — show a definition in an overlay without adding it to main chat context. With no text, reads the clipboard first, then prompts if the clipboard is unavailable/empty.
- `/act <request>` — immediately ask the assistant to make a scoped code change.

## Internal tool

- `learning_goal` — lets the tutor update the visible learning purpose with the concise why-level goal inferred from the current discussion.

## Behavior

While learning mode is active, the extension:

- injects tutor-mode instructions into the agent context,
- treats `/learn` text as starting context rather than a fixed goal,
- keeps the concise why-level learning purpose visible as the conversation evolves, abstracting one level above the immediate task (for example, loops → doing things repeatedly; one-hot vectors → machine-learnable representations) and uses a 3–4 line plain-language paragraph to define important task words, explain why the current step helps now, and show where the learner will reuse it later,
- offers small learner-owned steps only when useful, without a forced `Next action:` footer,
- introduces new terms through a short prerequisite ladder, defining mandatory concepts before relying on downstream jargon (for example, prediction/error before loss/gradient in basic ML),
- adds lightweight 30–90 second quick checks after key concepts when useful, renders them as prominent standalone `## ✅ Quick Check` sections, evaluates learner answers supportively, and uses a visible skip note when checks would interrupt flow,
- treats `/exercise` as a larger context-aware build challenge command: it should inspect bounded evidence such as recent commits/diffs or the issue at hand, then ask the learner to build a new scoped artifact rather than make one tiny edit,
- keeps all external/research tools available (for example web/code search, fetch tools, MCP tools, `gh`, `curl`, or small URL-fetch scripts) without requiring extra permission,
- blocks `edit`, `write`, and mutating bash commands by default, while allowing user-requested comment-only edits that add/refine explanations without changing executable code,
- transforms readiness signals like `done`, `review`, or `I tried it` into review prompts,
- asks the assistant to inspect relevant files/diffs before reviewing,
- supports `/define` and `ctrl+shift+d` definition overlays,
- leaves native terminal mouse selection/scrollback behavior alone by default, and
- supports `/act <request>` as a fire-and-forget escape hatch for broader scoped code changes.

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
