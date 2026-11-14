/**
 * P4-C gaze contract stub (CONTRACT §6). yolo26s (COCO) has no gaze or
 * head-pose output, so NO gaze event can ever be produced and the UI never
 * shows gaze warnings. This constant is the entire contract surface —
 * intentional dead end, not a TODO.
 */
export const GAZE_SUPPORT = {
  supported: false,
  reason: "yolo26s (COCO) has no gaze/head-pose output",
} as const;

export type GazeSupport = typeof GAZE_SUPPORT;
