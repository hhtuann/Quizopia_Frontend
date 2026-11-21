import { describe, expect, it } from "vitest";
import {
  computeLineDiff,
  diffLineCounts,
  diffLines,
  sideBySideDiffRows,
  splitDiffLines,
  unifiedDiffRows,
  type LineDiffScript,
} from "./diff";

function ops(script: LineDiffScript): string {
  return script.hunks.map((h) => `${h.op[0]}${h.count}`).join(" ");
}

describe("splitDiffLines", () => {
  it("splits on all line endings without phantom trailing lines", () => {
    expect(splitDiffLines("a\nb")).toEqual(["a", "b"]);
    expect(splitDiffLines("a\r\nb")).toEqual(["a", "b"]);
    expect(splitDiffLines("a\rb")).toEqual(["a", "b"]);
    expect(splitDiffLines("a\n")).toEqual(["a"]);
    expect(splitDiffLines("")).toEqual([]);
  });
});

describe("diffLines (Myers)", () => {
  it("returns a single equal hunk for identical inputs", () => {
    const script = diffLines(["a", "b", "c"], ["a", "b", "c"]);
    expect(ops(script)).toBe("e3");
    expect(diffLineCounts(script)).toEqual({ added: 0, deleted: 0 });
  });

  it("detects a pure insertion", () => {
    const script = diffLines(["a", "c"], ["a", "b", "c"]);
    expect(ops(script)).toBe("e1 i1 e1");
    expect(diffLineCounts(script)).toEqual({ added: 1, deleted: 0 });
  });

  it("detects a pure deletion", () => {
    const script = diffLines(["a", "b", "c"], ["a", "c"]);
    expect(ops(script)).toBe("e1 d1 e1");
    expect(diffLineCounts(script)).toEqual({ added: 0, deleted: 1 });
  });

  it("detects a middle replacement", () => {
    const script = diffLines(["a", "b", "c"], ["a", "x", "c"]);
    expect(ops(script)).toBe("e1 d1 i1 e1");
    expect(diffLineCounts(script)).toEqual({ added: 1, deleted: 1 });
  });

  it("handles empty before/after", () => {
    expect(ops(diffLines([], ["x"]))).toBe("i1");
    expect(ops(diffLines(["x"], []))).toBe("d1");
    expect(ops(diffLines([], []))).toBe("");
  });

  it("finds the minimal edit script for shuffled lines", () => {
    const before = ["q1", "q2", "q3", "q4", "q5"];
    const after = ["q1", "q3", "q4", "q5", "q6"];
    const script = diffLines(before, after);
    // q2 removed, q6 appended — 1 delete + 1 insert minimum.
    expect(diffLineCounts(script)).toEqual({ added: 1, deleted: 1 });
  });

  it("handles Vietnamese text and long documents", () => {
    const before = Array.from({ length: 300 }, (_, i) => `Câu ${i}: dòng tiếng Việt dài với dấu ${i}`);
    const after = [...before];
    after[150] = "Câu 150: dòng đã sửa";
    after.push("Câu 300: mới");
    const script = diffLines(before, after);
    // One replaced line + one appended line: 2 inserts, 1 delete.
    expect(diffLineCounts(script)).toEqual({ added: 2, deleted: 1 });
    // Replaying the script reconstructs the after document exactly.
    const rows = unifiedDiffRows(before, after, script);
    const rebuiltDelete = rows.filter((r) => r.op !== "insert").map((r) => r.text);
    const rebuiltInsert = rows.filter((r) => r.op !== "delete").map((r) => r.text);
    expect(rebuiltDelete).toEqual(before);
    expect(rebuiltInsert).toEqual(after);
  });

  it("reconstructs both documents for a large random-ish change", () => {
    const before = Array.from({ length: 120 }, (_, i) =>
      i % 7 === 0 ? `header ${i}` : `Question ${i} [SINGLE_CHOICE]: câu hỏi số ${i}`,
    );
    const after = before.flatMap((line, i) =>
      i % 11 === 5 ? [line, `Question new ${i} extra`] : i % 13 === 3 ? [] : [line],
    );
    const { script, rows } = computeLineDiff(before.join("\n"), after.join("\n"));
    expect(
      rows.filter((r) => r.op !== "insert").map((r) => r.text),
    ).toEqual(before);
    expect(
      rows.filter((r) => r.op !== "delete").map((r) => r.text),
    ).toEqual(after);
    expect(script.hunks.length).toBeGreaterThan(0);
  });
});

describe("unifiedDiffRows", () => {
  it("numbers before/after lines correctly across changes", () => {
    const { rows } = computeLineDiff("l1\nl2\nl3", "l1\nL2\nl3\nl4");
    expect(rows).toEqual([
      { op: "equal", beforeNumber: 1, afterNumber: 1, text: "l1" },
      { op: "delete", beforeNumber: 2, afterNumber: null, text: "l2" },
      { op: "insert", beforeNumber: null, afterNumber: 2, text: "L2" },
      { op: "equal", beforeNumber: 3, afterNumber: 3, text: "l3" },
      { op: "insert", beforeNumber: null, afterNumber: 4, text: "l4" },
    ]);
  });
});

describe("sideBySideDiffRows", () => {
  it("pairs deletes and inserts and pads the shorter side", () => {
    const { rows } = computeLineDiff("a\nb\nc", "a\nx\ny\nz\nc");
    const side = sideBySideDiffRows(rows);
    expect(side).toEqual([
      { op: "equal", before: { number: 1, text: "a" }, after: { number: 1, text: "a" } },
      { op: "replace", before: { number: 2, text: "b" }, after: { number: 2, text: "x" } },
      { op: "insert", before: null, after: { number: 3, text: "y" } },
      { op: "insert", before: null, after: { number: 4, text: "z" } },
      { op: "equal", before: { number: 3, text: "c" }, after: { number: 5, text: "c" } },
    ]);
  });

  it("marks unpaired deletions", () => {
    const { rows } = computeLineDiff("a\nb\nc", "a\nc");
    const side = sideBySideDiffRows(rows);
    expect(side[1]).toEqual({
      op: "delete",
      before: { number: 2, text: "b" },
      after: null,
    });
  });
});

describe("computeLineDiff", () => {
  it("reports a no-change state honestly", () => {
    const { counts, rows } = computeLineDiff("same\ndoc", "same\ndoc");
    expect(counts).toEqual({ added: 0, deleted: 0 });
    expect(rows.every((r) => r.op === "equal")).toBe(true);
  });
});

describe("diffLines stress (deterministic pseudo-random)", () => {
  // Mulberry32 — small deterministic PRNG so failures reproduce exactly.
  function rng(seed: number) {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("reconstructs both documents and stays minimal-ish across random edits", () => {
    const random = rng(20261121);
    for (let round = 0; round < 30; round += 1) {
      const size = 1 + Math.floor(random() * 60);
      const before = Array.from({ length: size }, (_, i) => `line-${round}-${i}`);
      const after = [...before];
      const edits = 1 + Math.floor(random() * 6);
      let expectedDeletes = 0;
      let expectedInserts = 0;
      for (let e = 0; e < edits; e += 1) {
        const kind = random();
        if (kind < 0.34 && after.length > 0) {
          after.splice(Math.floor(random() * after.length), 1);
          expectedDeletes += 1;
        } else if (kind < 0.67) {
          after.splice(Math.floor(random() * (after.length + 1)), 0, `new-${round}-${e}`);
          expectedInserts += 1;
        } else if (after.length > 0) {
          after[Math.floor(random() * after.length)] = `mod-${round}-${e}`;
          expectedDeletes += 1;
          expectedInserts += 1;
        }
      }
      const { script, rows } = computeLineDiff(before.join("\n"), after.join("\n"));
      // Reconstruction invariant (exact).
      expect(
        rows.filter((r) => r.op !== "insert").map((r) => r.text),
      ).toEqual(before);
      expect(
        rows.filter((r) => r.op !== "delete").map((r) => r.text),
      ).toEqual(after);
      // Optimality bound: the diff never needs more than the applied edits.
      const counts = diffLineCounts(script);
      expect(counts.added).toBeLessThanOrEqual(expectedInserts);
      expect(counts.deleted).toBeLessThanOrEqual(expectedDeletes);
    }
  });
});
