export type EditModeState =
  | { phase: "off" }
  | { phase: "execute"; request: string; startedAt: number }
  // Legacy phases kept so restored sessions from older versions can be reset safely.
  | { phase: "draft"; request: string; startedAt: number }
  | { phase: "awaiting-approval"; request: string; startedAt: number }
  | { phase: "apply"; request: string; startedAt: number };

export interface ExerciseRecord {
  topic?: string;
  createdAt: number;
}

export interface LearningState {
  active: boolean;
  goal?: string;
  currentStep?: string;
  relevantFiles: string[];
  reviewedDiffRefs: string[];
  lastLearnerSignal?: string;
  exercisesGiven: ExerciseRecord[];
  progressNotes: string[];
  editMode: EditModeState;
  updatedAt: number;
}

export interface LanguageHint {
  name: string;
  fence: string;
  source: string;
}

export interface CommentSyntax {
  line: string[];
  block: Array<{ start: string; end: string }>;
  backtickStrings?: boolean;
}
