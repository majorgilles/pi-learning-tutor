export type EditModeState =
  | { phase: "off" }
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
