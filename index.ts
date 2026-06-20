import {
  isToolCallEventType,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { LEARN_OFF_COMMAND } from "./src/constants.js";
import {
  ENABLE_MOUSE_SELECTION_CAPTURE,
  askModelForDefinition,
  installSelectionDefineSupport,
  readTextFromClipboard,
  showDefinitionOverlay,
  type SelectionSupport,
  uninstallSelectionDefineSupport,
} from "./src/definition.js";
import { sanitizeLatexForTerminalMarkdown } from "./src/latex.js";
import { detectCurrentLanguage } from "./src/language.js";
import {
  broadReviewPrompt,
  exerciseRequestPrompt,
  learningInstructions,
  reviewSignalPrompt,
  startLearningThreadPrompt,
} from "./src/prompts.js";
import {
  CONTEXT_CUSTOM_TYPE,
  DEFAULT_STATE,
  cloneState,
  persist,
  restoreState,
  sendAsUser,
  updateStatus,
} from "./src/state.js";
import {
  READINESS_RE,
  isCommentOnlyEdit,
  isCommentOnlyWrite,
  isProbablyReadOnlyBash,
  userRequestedCommentEdit,
} from "./src/tool-gates.js";
import type { LearningState } from "./src/types.js";

const LEARNING_GOAL_TOOL_NAME = "learning_goal";

export default function learningTutorExtension(pi: ExtensionAPI): void {
  let state: LearningState = cloneState(DEFAULT_STATE);
  let selectionSupport: SelectionSupport | undefined;

  function syncLearningGoalTool(active: boolean): void {
    const activeTools = pi.getActiveTools();
    const hasLearningGoalTool = activeTools.includes(LEARNING_GOAL_TOOL_NAME);

    if (active && !hasLearningGoalTool) {
      pi.setActiveTools([
        ...activeTools,
        LEARNING_GOAL_TOOL_NAME,
      ]);
      return;
    }

    if (!active && hasLearningGoalTool) {
      pi.setActiveTools(
        activeTools.filter((toolName) => toolName !== LEARNING_GOAL_TOOL_NAME),
      );
    }
  }

  function enableSelectionSupport(ctx: ExtensionContext): void {
    if (!ENABLE_MOUSE_SELECTION_CAPTURE) {
      // Disabled by default: terminal mouse tracking hijacks mouse-wheel
      // scrollback and native text selection in most terminals. Use `/define`
      // after copying text, or the Ctrl+Shift+D/manual fallback, instead of
      // capturing mouse drags inside the extension.
      return;
    }
    if (!ctx.hasUI || selectionSupport) return;
    selectionSupport = installSelectionDefineSupport(ctx, () => state);
  }

  function disableSelectionSupport(ctx?: ExtensionContext): void {
    uninstallSelectionDefineSupport(ctx, selectionSupport);
    selectionSupport = undefined;
  }

  function enableLearning(ctx: ExtensionContext, goal: string): void {
    const startingContext = goal || state.goal;
    state = {
      ...state,
      active: true,
      goal: startingContext,
      // The model infers the durable why-level purpose from this context.
      workingGoal: undefined,
      editMode: { phase: "off" },
    };
    syncLearningGoalTool(true);
    enableSelectionSupport(ctx);
    updateStatus(ctx, state);
    persist(pi, state);
  }

  function disableLearning(ctx: ExtensionContext): void {
    state = { ...state, active: false, editMode: { phase: "off" } };
    syncLearningGoalTool(false);
    disableSelectionSupport(ctx);
    updateStatus(ctx, state);
    persist(pi, state);
  }

  pi.on("session_start", async (_event, ctx) => {
    disableSelectionSupport(ctx);
    state = restoreState(ctx);
    if (
      state.editMode.phase === "draft" ||
      state.editMode.phase === "awaiting-approval"
    ) {
      state = { ...state, editMode: { phase: "off" } };
      persist(pi, state);
    }
    if (state.active) {
      syncLearningGoalTool(true);
      enableSelectionSupport(ctx);
    } else {
      syncLearningGoalTool(false);
    }
    updateStatus(ctx, state);
  });

  pi.on("session_shutdown", async () => {
    disableSelectionSupport();
  });

  pi.registerTool({
    name: LEARNING_GOAL_TOOL_NAME,
    label: "Learning Purpose",
    description:
      "Update the visible why-level learning purpose for the active learning-tutor thread.",
    parameters: Type.Object({
      goal: Type.String({
        description:
          "Concise learner-facing why-level goal: the durable capability or concept being learned, not the immediate task.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!state.active) {
        return {
          content: [{ type: "text", text: "Learning mode is not active." }],
          details: { active: false },
        };
      }

      const learningPurpose = params.goal
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 200);
      state = {
        ...state,
        workingGoal: learningPurpose || state.workingGoal,
      };
      persist(pi, state);
      updateStatus(ctx, state);

      return {
        content: [
          {
            type: "text",
            text: `Learning purpose: ${state.workingGoal || "(inferring why-level goal)"}`,
          },
        ],
        details: { active: true, workingGoal: state.workingGoal },
      };
    },
  });

  pi.registerCommand("learn", {
    description:
      "Start learning mode with initial context; turn it off with /learn off",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (trimmed.toLowerCase() === LEARN_OFF_COMMAND) {
        disableLearning(ctx);
        ctx.ui.notify("Learning mode off", "info");
        return;
      }

      if (!trimmed) {
        ctx.ui.notify("Usage: /learn <anything> or /learn off", "warning");
        return;
      }

      enableLearning(ctx, trimmed);
      await sendAsUser(pi, ctx, startLearningThreadPrompt(trimmed));
    },
  });

  pi.registerCommand("exercise", {
    description: "Generate a build-oriented understanding challenge",
    handler: async (args, ctx) => {
      if (!state.active) {
        ctx.ui.notify(
          "Tip: start learning mode with /learn <anything> for context-aware build challenges.",
          "info",
        );
      }
      const topic = args.trim();
      state.exercisesGiven.push({
        topic: topic || undefined,
        createdAt: Date.now(),
      });
      persist(pi, state);
      await sendAsUser(pi, ctx, exerciseRequestPrompt(topic));
    },
  });

  pi.registerCommand("review", {
    description:
      "Broad learning review, e.g. /review commit history or /review overall task",
    handler: async (args, ctx) => {
      await sendAsUser(pi, ctx, broadReviewPrompt(args.trim()));
    },
  });

  pi.registerCommand("define", {
    description:
      "Define text in an overlay. With no args, reads the clipboard first.",
    handler: async (args, ctx) => {
      const explicitText = args.trim();
      const clipboard = explicitText ? undefined : readTextFromClipboard();
      const clipboardText = clipboard?.ok === true ? clipboard.text.trim() : "";
      const text =
        explicitText ||
        clipboardText ||
        (
          await ctx.ui.input("Define what word or sentence?", "borrow checker")
        )?.trim();
      if (!text) return;
      if (!explicitText && clipboard && clipboard.ok === false) {
        ctx.ui.notify(`Could not read clipboard: ${clipboard.error}`, "warning");
      }
      ctx.ui.notify("Preparing definition overlay...", "info");
      const definition = await askModelForDefinition(ctx, state, text);
      await showDefinitionOverlay(ctx, text, definition);
    },
  });

  pi.registerShortcut("ctrl+shift+d", {
    description: "Define selected/current text in learning overlay fallback",
    handler: async (ctx) => {
      const editorText = ctx.ui.getEditorText()?.trim();
      const text =
        editorText ||
        (
          await ctx.ui.input("Define what word or sentence?", "term to define")
        )?.trim();
      if (!text) return;
      ctx.ui.notify("Preparing definition overlay...", "info");
      const definition = await askModelForDefinition(ctx, state, text);
      await showDefinitionOverlay(ctx, text, definition);
    },
  });

  pi.registerCommand("act", {
    description: "Act on a scoped AI code change request immediately",
    handler: async (args, ctx) => {
      if (!state.active) {
        ctx.ui.notify(
          "Act is only available inside learning mode. Start with /learn <anything>.",
          "warning",
        );
        return;
      }

      const request = args.trim();
      if (!request) {
        ctx.ui.notify("Usage: /act <request>", "warning");
        return;
      }

      if (!ctx.isIdle()) {
        ctx.ui.notify(
          "Act request will run after the current agent turn finishes.",
          "info",
        );
        await ctx.waitForIdle();
      }

      state.editMode = { phase: "act", request, startedAt: Date.now() };
      persist(pi, state);
      updateStatus(ctx, state);
      pi.sendUserMessage(request);
    },
  });

  pi.on("input", async (event) => {
    if (!state.active) {
      syncLearningGoalTool(false);
      return { action: "continue" };
    }

    syncLearningGoalTool(true);

    if (event.source === "extension" || event.text.trim().startsWith("/")) {
      return { action: "continue" };
    }

    if (READINESS_RE.test(event.text)) {
      state.lastLearnerSignal = event.text.trim();
      persist(pi, state);
      return { action: "transform", text: reviewSignalPrompt(event.text) };
    }

    return { action: "continue" };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!state.active) {
      syncLearningGoalTool(false);
      return;
    }
    syncLearningGoalTool(true);
    return {
      systemPrompt: `${event.systemPrompt}\n\n${learningInstructions(
        state,
        detectCurrentLanguage(ctx.cwd),
      )}`,
    };
  });

  pi.on("context", async (event) => {
    const messages = event.messages.filter(
      (message: any) =>
        !(message?.role === "custom" && message.customType === CONTEXT_CUSTOM_TYPE),
    );
    if (messages.length === event.messages.length) return;
    return { messages };
  });

  (pi.on as any)("message_end", async (event: any) => {
    if (!state.active || event.message.role !== "assistant") return;

    let changed = false;
    const content = event.message.content;
    const sanitizedContent = Array.isArray(content)
      ? content.map((part: any) => {
          if (part?.type !== "text" || typeof part.text !== "string") return part;
          const sanitizedText = sanitizeLatexForTerminalMarkdown(part.text);
          if (sanitizedText === part.text) return part;
          changed = true;
          return { ...part, text: sanitizedText };
        })
      : typeof content === "string"
        ? (() => {
            const sanitizedText = sanitizeLatexForTerminalMarkdown(content);
            changed = sanitizedText !== content;
            return sanitizedText;
          })()
        : content;

    if (!changed) return;
    return { message: { ...event.message, content: sanitizedContent } };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!state.active) return;
    const executing =
      state.editMode.phase === "act" ||
      state.editMode.phase === "execute" ||
      state.editMode.phase === "apply";

    if (isToolCallEventType("bash", event)) {
      if (executing) return;
      const command = event.input.command ?? "";
      if (!isProbablyReadOnlyBash(command)) {
        return {
          block: true,
          reason: `Learning tutor blocked a mutating bash command. Default learning mode is read-only for local changes, but external/research tools are allowed. Use /act <request> to run a scoped code change.\nCommand: ${command}`,
        };
      }
      return;
    }

    if (isToolCallEventType("edit", event)) {
      if (executing) return;
      if (userRequestedCommentEdit(ctx) && isCommentOnlyEdit(event.input)) {
        return;
      }
      return {
        block: true,
        reason:
          "Learning tutor blocked AI file edits. The learner should type code changes. User-requested comment-only explanatory edits are allowed; broader edits need /act <request>.",
      };
    }

    if (isToolCallEventType("write", event)) {
      if (executing) return;
      if (
        userRequestedCommentEdit(ctx) &&
        isCommentOnlyWrite(ctx.cwd, event.input)
      ) {
        return;
      }
      return {
        block: true,
        reason:
          "Learning tutor blocked AI file writes. The learner should type code changes. User-requested comment-only explanatory edits to existing files are allowed; broader writes need /act <request>.",
      };
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!state.active) return;

    if (
      state.editMode.phase === "draft" ||
      state.editMode.phase === "awaiting-approval"
    ) {
      state.editMode = { phase: "off" };
      persist(pi, state);
      updateStatus(ctx, state);
      return;
    }

    if (
      state.editMode.phase === "act" ||
      state.editMode.phase === "execute" ||
      state.editMode.phase === "apply"
    ) {
      state.editMode = { phase: "off" };
      persist(pi, state);
      updateStatus(ctx, state);
    }
  });
}
