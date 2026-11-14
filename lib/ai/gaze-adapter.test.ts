import { describe, expect, it } from "vitest";
import { GAZE_SUPPORT } from "./gaze-adapter";

/** P4-C §7: gaze stays a DISABLED contract — yolo26s (COCO) has no
 * gaze/head-pose output, so no runtime code exists beyond the constant. */
describe("gaze adapter stub", () => {
  it("is unsupported with the contract reason", () => {
    expect(GAZE_SUPPORT.supported).toBe(false);
    expect(GAZE_SUPPORT.reason).toBe("yolo26s (COCO) has no gaze/head-pose output");
  });
});
