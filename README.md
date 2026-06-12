# Pi Learning Tutor

Turn any pi session into your always-on, AI-assisted teacher: part patient professor, part sharp tutorial creator, part code reviewer that never loses the thread. Learning Tutor keeps the learner's why-level purpose visible, explains why the current step matters now and later, builds concepts gradually, blocks AI-authored edits by default, reviews learner attempts with bounded read-only inspection, and adapts no matter how simple, messy, or advanced the question is.

## Why this is useful

Great professors and tutorial creators do more than deliver information: they notice confusion, choose the next explanation, create the right-sized exercise, and connect today's tiny question to the bigger idea. Learning Tutor automates those teaching moves inside pi, turning the current repo, issue, notebook, code diff, error message, or question into a contextual tutorial that keeps reshaping itself around the learner.

The learner can ask "why?", challenge an example, request a smaller step, paste an error, or ask to document an insight. The tutor treats every question as useful signal and keeps adapting without taking ownership away from the learner.

Progressive reviews are where the value compounds. Instead of one big pass/fail check, the tutor reviews each attempt in context, names what improved, spots the next gap, and adjusts the follow-up explanation, quick check, or build challenge to the learner's current needs.

The visible current learning goal is the anchor that makes the loop powerful. It keeps the durable purpose highlighted while the immediate task changes, so a small moment like fixing a shape error, reading a softmax table, or creating a notebook cell stays connected to the larger concept being learned.

Because the tutor reads the current conversation, files, diffs, and learner responses before guiding the next step, the experience becomes highly customized: pacing, examples, definitions, review depth, and next exercises can all adapt to what the learner is actually trying to understand.

A typical learning loop feels like this:

1. Start from real context: an issue, tutorial, file, error, or question.
2. Keep the current why-level learning goal visible while the details evolve.
3. Explain the next concept in prerequisite order, with the now/later payoff.
4. Let the learner try, push back, ask "why?", or request a smaller step.
5. Review the attempt progressively, update the goal if needed, and continue with guidance tailored to the learner's needs.

## Install

```bash
pi install npm:@majorgilles/pi-learning-tutor
```

For a one-off run without adding it to settings:

```bash
pi -e npm:@majorgilles/pi-learning-tutor
```

## Commands

- `/learn <anything>` — start learning mode with arbitrary starting context; the why-level learning purpose is inferred and updated through the discussion. If the context is an obvious primary resource such as a book/chapter PDF or exact tutorial link, the tutor reads that resource and follows it faithfully as the main lesson path.
- `/learn off` — leave learning mode. This is the only stop command; plain positive readiness/progress messages remain review signals while learning mode is active.
- `/exercise [topic]` — generate a context-calibrated build challenge based on the current learning context, recent commits/diffs, or issue/resources; no solution up front.
- `/review [scope]` — request a broader learning review.
- `/define [text]` — show a definition in an overlay without adding it to main chat context. With no text, reads the clipboard first, then prompts if the clipboard is unavailable/empty.
- `/act <request>` — immediately ask the assistant to make a scoped code change.

## Review readiness signals

When the tutor asks you to produce something for the current step (code/file changes, command output, a quick-check answer, notes, or an exercise artifact), it should simply tell you to say in your own words when your attempt is ready. It should not list exact trigger phrases or expose the internal review tag. Explanation-only steps should not show the readiness note.

## Internal tool

- `learning_goal` — lets the tutor update the visible learning purpose with the concise why-level goal inferred from the current discussion.

## Behavior

While learning mode is active, the extension:

- injects tutor-mode instructions into the agent context,
- treats `/learn` text as starting context rather than a fixed goal,
- recognizes obvious primary resources in `/learn` input, including bare/exact URLs, tutorial links, and document paths such as PDFs; it should fetch/read/parse the exact resource first, preserve the source order, terminology, examples, notation, and exercises, and clearly label any supplemental adaptation instead of substituting a generic lesson,
- keeps the concise why-level learning purpose visible as the conversation evolves, abstracting one level above the immediate task (for example, loops → doing things repeatedly; one-hot vectors → machine-learnable representations) and uses a 3–4 line plain-language paragraph to define important task words, explain why the current step helps now, and show where the learner will reuse it later,
- offers small learner-owned steps only when useful, without a forced `Next action:` footer,
- introduces new terms through a short prerequisite ladder, defining mandatory concepts before relying on downstream jargon (for example, prediction/error before loss/gradient in basic ML),
- adds lightweight 30–90 second quick checks after key concepts when useful, renders them as prominent standalone `## ✅ Quick Check` sections, evaluates learner answers supportively, and uses a visible skip note when checks would interrupt flow,
- keeps Markdown lessons readable by rendering headings/prose directly, keeping language code fences top-level so syntax highlighting works, avoiding nested triple-backtick Markdown fences, sanitizing Markdown-source examples that contain nested fences, writing formulas in terminal-readable plain text/Unicode instead of raw `$$` LaTeX blocks, and sanitizing accidental assistant LaTeX display blocks into styled Markdown formula callouts before they are shown,
- treats `/exercise` as a larger context-aware build challenge command: it should inspect bounded evidence such as recent commits/diffs or the issue at hand, then ask the learner to build a new scoped artifact rather than make one tiny edit,
- keeps all external/research tools available (for example web/code search, fetch tools, MCP tools, `gh`, `curl`, or small URL-fetch scripts) without requiring extra permission,
- blocks `edit`, `write`, and mutating bash commands by default, while allowing user-requested comment-only edits that add/refine explanations without changing executable code,
- infers natural readiness/progress messages as review requests, transforms them into the internal review prompt, and only mentions review readiness when the current step asks the learner to produce something,
- treats each new learner message as a possible progress signal; when it plausibly reflects code/work changes, asks the assistant to inspect bounded git status/diff, referenced files, or errors before reviewing the actual changes,
- supports `/define` and `ctrl+shift+d` definition overlays,
- leaves native terminal mouse selection/scrollback behavior alone by default, and
- supports `/act <request>` as a fire-and-forget escape hatch for broader scoped code changes.

Tip: select/copy terminal text normally, then run `/define` to define the clipboard contents. The old drag-to-define mouse capture is opt-in via `PI_LEARNING_TUTOR_MOUSE_CAPTURE=1` because it can break mouse-wheel scrollback.

## Notes for educators and creators

Learning Tutor is meant to amplify the best parts of human teaching, not replace or diminish them. It brings professor-style diagnosis, tutorial-creator pacing, and supportive review into the exact moment a learner gets stuck, so published lessons, classroom material, and real project work can become interactive.

The promise is simple: the learner gets an AI-assisted teacher that keeps adapting to them, whether they ask for a high-level map, a beginner-friendly definition, a tiny next step, or a serious review of their own attempt.

## Development checks

```bash
npm install
npm run typecheck
npm pack --dry-run
```

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the original implementation checklist.

## License

This source is available under the [MIT License](./LICENSE).
