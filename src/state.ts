import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { EditModeState, LearningState } from "./types.js";

export const STATE_ENTRY_TYPE = "learning-tutor-state";
export const CONTEXT_CUSTOM_TYPE = "learning-tutor-context";

export const DEFAULT_STATE: LearningState = {
  active: false,
  goal: undefined,
  currentStep: undefined,
  workingGoal: undefined,
  relevantFiles: [],
  reviewedDiffRefs: [],
  lastLearnerSignal: undefined,
  exercisesGiven: [],
  progressNotes: [],
  editMode: { phase: "off" },
  updatedAt: Date.now(),
};

export function cloneState(state: LearningState): LearningState {
  return {
    ...state,
    relevantFiles: [...state.relevantFiles],
    reviewedDiffRefs: [...state.reviewedDiffRefs],
    exercisesGiven: [...state.exercisesGiven],
    progressNotes: [...state.progressNotes],
    editMode: { ...state.editMode } as EditModeState,
  };
}

export function restoreState(ctx: ExtensionContext): LearningState {
  const latest = ctx.sessionManager
    .getEntries()
    .filter(
      (entry: any) =>
        entry?.type === "custom" && entry.customType === STATE_ENTRY_TYPE,
    )
    .pop() as { data?: Partial<LearningState> } | undefined;

  if (!latest?.data) return cloneState(DEFAULT_STATE);

  return {
    ...cloneState(DEFAULT_STATE),
    ...latest.data,
    relevantFiles: Array.isArray(latest.data.relevantFiles)
      ? latest.data.relevantFiles
      : [],
    reviewedDiffRefs: Array.isArray(latest.data.reviewedDiffRefs)
      ? latest.data.reviewedDiffRefs
      : [],
    exercisesGiven: Array.isArray(latest.data.exercisesGiven)
      ? latest.data.exercisesGiven
      : [],
    progressNotes: Array.isArray(latest.data.progressNotes)
      ? latest.data.progressNotes
      : [],
    editMode: latest.data.editMode ?? { phase: "off" },
    updatedAt: latest.data.updatedAt ?? Date.now(),
  };
}

export function updateStatus(
  ctx: ExtensionContext,
  state: LearningState,
): void {
  if (!state.active) {
    ctx.ui.setStatus("learning-tutor", undefined);
    ctx.ui.setWidget("learning-tutor", undefined);
    return;
  }

  const phase =
    state.editMode.phase === "off"
      ? "code edits gated"
      : state.editMode.phase === "act" ||
          state.editMode.phase === "execute" ||
          state.editMode.phase === "apply"
        ? "act active"
        : "legacy act state";
  ctx.ui.setStatus(
    "learning-tutor",
    ctx.ui.theme.fg("warning", `🎓 learning (${phase})`),
  );
  const learningPurpose = state.workingGoal?.trim();
  ctx.ui.setWidget("learning-tutor", [
    ctx.ui.theme.fg("accent", "🎓 Learning mode active"),
    ctx.ui.theme.fg(
      "muted",
      `Learning purpose: ${
        learningPurpose
          ? learningPurpose.slice(0, 100)
          : "inferring the why-level goal from the current context..."
      }`,
    ),
    ctx.ui.theme.fg(
      "muted",
      "AI code edits are blocked unless `/act <request>` is active; requested comment-only explanations are allowed.",
    ),
  ]);
}

export function persist(pi: ExtensionAPI, state: LearningState): void {
  state.updatedAt = Date.now();
  pi.appendEntry(STATE_ENTRY_TYPE, cloneState(state));
}

export async function sendAsUser(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  message: string,
): Promise<void> {
  if (ctx.isIdle()) {
    pi.sendUserMessage(message);
  } else {
    pi.sendUserMessage(message, { deliverAs: "followUp" });
    ctx.ui.notify("Learning tutor request queued as a follow-up", "info");
  }
}
