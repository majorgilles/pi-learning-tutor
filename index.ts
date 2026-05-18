import {
  isToolCallEventType,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  CODE_SAMPLES_CUSTOM_TYPE,
  normalizeCodeSamplesInContent,
  renderCodeSamplesMessage,
} from "./src/code-samples.js";
import { LEARN_DONE } from "./src/constants.js";
import {
  ENABLE_MOUSE_SELECTION_CAPTURE,
  askModelForDefinition,
  copyTextToClipboard,
  installSelectionDefineSupport,
  readTextFromClipboard,
  showDefinitionOverlay,
  type SelectionSupport,
  uninstallSelectionDefineSupport,
} from "./src/definition.js";
import { detectCurrentLanguage } from "./src/language.js";
import {
  broadReviewPrompt,
  editModeApplyPrompt,
  editModeDraftPrompt,
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

export default function learningTutorExtension(pi: ExtensionAPI): void {
  let state: LearningState = cloneState(DEFAULT_STATE);
  let selectionSupport: SelectionSupport | undefined;

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
    state = {
      ...state,
      active: true,
      goal: goal || state.goal,
      editMode: { phase: "off" },
    };
    enableSelectionSupport(ctx);
    updateStatus(ctx, state);
    persist(pi, state);
  }

  function disableLearning(ctx: ExtensionContext): void {
    state = { ...state, active: false, editMode: { phase: "off" } };
    disableSelectionSupport(ctx);
    updateStatus(ctx, state);
    persist(pi, state);
  }

  pi.on("session_start", async (_event, ctx) => {
    disableSelectionSupport(ctx);
    state = restoreState(ctx);
    if (state.active) {
      enableSelectionSupport(ctx);
    }
    updateStatus(ctx, state);
  });

  pi.on("session_shutdown", async () => {
    disableSelectionSupport();
  });

  pi.registerMessageRenderer(
    CODE_SAMPLES_CUSTOM_TYPE,
    renderCodeSamplesMessage,
  );

  pi.registerCommand("learn", {
    description:
      "Start/stop a persistent learning-tutor thread: /learn <anything>, /learn done, /learn off",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (LEARN_DONE.has(trimmed.toLowerCase())) {
        disableLearning(ctx);
        ctx.ui.notify("Learning mode off", "info");
        return;
      }

      if (!trimmed) {
        ctx.ui.notify("Usage: /learn <anything> or /learn done", "warning");
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

  pi.registerCommand("copy-code", {
    description: "Copy the latest tutor code sample: /copy-code [number]",
    handler: async (args, ctx) => {
      const samples = state.codeSamples;
      if (samples.length === 0) {
        ctx.ui.notify("No tutor code samples are available to copy yet.", "warning");
        return;
      }

      const parsed = Number.parseInt(args.trim() || "1", 10);
      const index = Number.isFinite(parsed) ? parsed : 1;
      const sample = samples.find((item) => item.index === index);
      if (!sample) {
        ctx.ui.notify(
          `No code sample ${index}. Available samples: ${samples
            .map((item) => item.index)
            .join(", ")}`,
          "warning",
        );
        return;
      }

      const copied = copyTextToClipboard(sample.code);
      ctx.ui.notify(
        copied.ok === true
          ? `Copied code sample ${index} to clipboard`
          : `Copy failed: ${copied.error}`,
        copied.ok === true ? "info" : "warning",
      );
    },
  });

  pi.registerCommand("edit-mode", {
    description:
      "Two-step patch approval: /edit-mode <request>, then /edit-mode apply",
    handler: async (args, ctx) => {
      if (!state.active) {
        ctx.ui.notify(
          "Edit mode is only available inside learning mode. Start with /learn <anything>.",
          "warning",
        );
        return;
      }

      const trimmed = args.trim();
      if (trimmed.toLowerCase() === "apply") {
        if (state.editMode.phase !== "awaiting-approval") {
          ctx.ui.notify(
            "No drafted patch is awaiting approval. Run /edit-mode <request> first.",
            "warning",
          );
          return;
        }
        state.editMode = {
          phase: "apply",
          request: state.editMode.request,
          startedAt: Date.now(),
        };
        persist(pi, state);
        updateStatus(ctx, state);
        await sendAsUser(pi, ctx, editModeApplyPrompt(state.editMode.request));
        return;
      }

      const request =
        trimmed ||
        (
          await ctx.ui.editor(
            "What should the AI draft? It will not apply changes yet.",
            "",
          )
        )?.trim();
      if (!request) return;
      state.editMode = { phase: "draft", request, startedAt: Date.now() };
      persist(pi, state);
      updateStatus(ctx, state);
      await sendAsUser(pi, ctx, editModeDraftPrompt(request));
    },
  });

  pi.on("input", async (event) => {
    if (
      !state.active ||
      event.source === "extension" ||
      event.text.trim().startsWith("/")
    ) {
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
    if (!state.active) return;
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
        !(message?.role === "custom" &&
          (message.customType === CONTEXT_CUSTOM_TYPE ||
            message.customType === CODE_SAMPLES_CUSTOM_TYPE)),
    );
    if (messages.length === event.messages.length) return;
    return { messages };
  });

  pi.on("message_end", async (event) => {
    if (!state.active || event.message.role !== "assistant") return;

    const normalized = normalizeCodeSamplesInContent(event.message.content);
    if (normalized.samples.length > 0) {
      state = { ...state, codeSamples: normalized.samples };
      persist(pi, state);
      pi.sendMessage(
        {
          customType: CODE_SAMPLES_CUSTOM_TYPE,
          content: `${normalized.samples.length} copyable code sample(s)`,
          display: true,
          details: { samples: normalized.samples },
        },
        { deliverAs: "followUp" },
      );
    }

    if (!normalized.changed) return;
    return {
      message: {
        ...event.message,
        content: normalized.content,
      },
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!state.active) return;
    const applying = state.editMode.phase === "apply";

    if (isToolCallEventType("bash", event)) {
      if (applying) return;
      const command = event.input.command ?? "";
      if (!isProbablyReadOnlyBash(command)) {
        return {
          block: true,
          reason: `Learning tutor blocked a mutating bash command. Default learning mode is read-only for local changes, but external/research tools are allowed. Use /edit-mode for two-step patch approval.\nCommand: ${command}`,
        };
      }
      return;
    }

    if (isToolCallEventType("edit", event)) {
      if (applying) return;
      if (userRequestedCommentEdit(ctx) && isCommentOnlyEdit(event.input)) {
        return;
      }
      return {
        block: true,
        reason:
          "Learning tutor blocked AI file edits. The learner should type code changes. User-requested comment-only explanatory edits are allowed; broader edits need /edit-mode apply.",
      };
    }

    if (isToolCallEventType("write", event)) {
      if (applying) return;
      if (
        userRequestedCommentEdit(ctx) &&
        isCommentOnlyWrite(ctx.cwd, event.input)
      ) {
        return;
      }
      return {
        block: true,
        reason:
          "Learning tutor blocked AI file writes. The learner should type code changes. User-requested comment-only explanatory edits to existing files are allowed; broader writes need /edit-mode apply.",
      };
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!state.active) return;

    if (state.editMode.phase === "draft") {
      state.editMode = {
        phase: "awaiting-approval",
        request: state.editMode.request,
        startedAt: state.editMode.startedAt,
      };
      persist(pi, state);
      updateStatus(ctx, state);
      return;
    }

    if (state.editMode.phase === "apply") {
      state.editMode = { phase: "off" };
      persist(pi, state);
      updateStatus(ctx, state);
    }
  });
}
