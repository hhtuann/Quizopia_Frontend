/**
 * Line-based diff engine for AI change review (Quizopia_System #121, UX-05).
 *
 * Pure functions, no DOM: split before/after Markdown into logical lines,
 * compute a Myers O(ND) shortest edit script, and expose:
 * - `diffLines`: the raw edit script (equal/insert/delete hunks);
 * - `unifiedDiffRows`: unified rows (context + changes, one row per line);
 * - `sideBySideDiffRows`: paired old/new rows for the two-pane layout;
 * - `diffLineCounts`: honest `+added/-deleted` counters.
 *
 * The engine never mutates inputs and renders nothing — the diff viewer owns
 * presentation. Unicode-safe: lines are compared as JS strings (UTF-16 code
 * units), so Vietnamese text needs no special handling here.
 */

export type DiffOp = "equal" | "insert" | "delete" | "replace";

/** One hunk of the edit script: `op` applied to `count` lines. */
export interface DiffHunk {
  readonly op: DiffOp;
  /** Number of lines this hunk covers in its input (both for equal). */
  readonly count: number;
}

/** Raw edit script between two line arrays (Myers, greedy middle-snake). */
export interface LineDiffScript {
  readonly hunks: readonly DiffHunk[];
}

/** Row model for the unified diff layout. */
export interface UnifiedDiffRow {
  readonly op: DiffOp;
  /** 1-based line number in the BEFORE document; null for pure inserts. */
  readonly beforeNumber: number | null;
  /** 1-based line number in the AFTER document; null for pure deletions. */
  readonly afterNumber: number | null;
  readonly text: string;
}

/** Row model for the side-by-side layout (one row aligns old and new). */
export interface SideBySideDiffRow {
  readonly before: { readonly number: number | null; readonly text: string | null } | null;
  readonly after: { readonly number: number | null; readonly text: string | null } | null;
  readonly op: DiffOp;
}

export interface DiffLineCounts {
  readonly added: number;
  readonly deleted: number;
}

export function splitDiffLines(source: string): string[] {
  // Split on every line ending but keep the terminator OUT of the text;
  // a trailing terminator yields no phantom final empty line.
  if (source === "") {
    return [];
  }
  const lines = source.split(/\r\n|\r|\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/**
 * Myers diff over line arrays. Returns the shortest edit script as merged
 * hunks (adjacent same-op steps collapse). Iterative divide-and-conquer
 * around the middle snake — no recursion, so large documents cannot blow
 * the stack — and common prefix/suffix trimming keeps the search small for
 * typical Quiz Markdown edits (append a question, fix one line).
 */
export function diffLines(before: readonly string[], after: readonly string[]): LineDiffScript {
  const out: DiffHunk[] = [];
  const emit = (op: DiffOp, count: number) => {
    if (count <= 0) return;
    const last = out[out.length - 1];
    if (last !== undefined && last.op === op) {
      out[out.length - 1] = { op, count: last.count + count };
    } else {
      out.push({ op, count });
    }
  };

  interface Frame {
    readonly beforeStart: number;
    readonly beforeEnd: number;
    readonly afterStart: number;
    readonly afterEnd: number;
  }
  // Work list; frames pop in order left → snake → right because the right
  // half is pushed first.
  const tasks: Frame[] = [
    { beforeStart: 0, beforeEnd: before.length, afterStart: 0, afterEnd: after.length },
  ];

  while (tasks.length > 0) {
    const { beforeStart: x0, beforeEnd: x1, afterStart: y0, afterEnd: y1 } =
      tasks.pop() as Frame;
    const sizeX = x1 - x0;
    const sizeY = y1 - y0;
    if (sizeX === 0 && sizeY === 0) continue;
    if (sizeX === 0) {
      emit("insert", sizeY);
      continue;
    }
    if (sizeY === 0) {
      emit("delete", sizeX);
      continue;
    }

    // Trim the common prefix and suffix; the remaining middle region holds
    // every actual change. The suffix is re-queued as a trailing frame
    // (pushed FIRST so it pops LAST) — it emits its own equal hunk.
    let p = 0;
    while (p < sizeX && p < sizeY && before[x0 + p] === after[y0 + p]) {
      p += 1;
    }
    emit("equal", p);
    let s = 0;
    while (
      s < sizeX - p &&
      s < sizeY - p &&
      before[x1 - 1 - s] === after[y1 - 1 - s]
    ) {
      s += 1;
    }
    const midX0 = x0 + p;
    const midX1 = x1 - s;
    const midY0 = y0 + p;
    const midY1 = y1 - s;
    if (midX0 === midX1 && midY0 === midY1) continue;
    if (midX0 === midX1) {
      emit("insert", midY1 - midY0);
      emit("equal", s);
      continue;
    }
    if (midY0 === midY1) {
      emit("delete", midX1 - midX0);
      emit("equal", s);
      continue;
    }
    // Pure-replace guard: if the trimmed region shares NO line at all, the
    // edit is exactly delete-all + insert-all — emit and continue. This also
    // terminates the size-1x1 corner where a midpoint split would recurse
    // forever.
    if (!regionsShareLine(before, midX0, midX1, after, midY0, midY1)) {
      emit("delete", midX1 - midX0);
      emit("insert", midY1 - midY0);
      emit("equal", s);
      continue;
    }

    const mid = middleSnake(before, midX0, midX1, after, midY0, midY1);
    // Push order controls pop order: suffix frame first (pops last), then
    // right, snake, left — net emission order left → snake → right → suffix.
    if (s > 0) {
      tasks.push({
        beforeStart: midX1,
        beforeEnd: x1,
        afterStart: midY1,
        afterEnd: y1,
      });
    }
    tasks.push({
      beforeStart: mid.snakeEndX,
      beforeEnd: midX1,
      afterStart: mid.snakeEndY,
      afterEnd: midY1,
    });
    tasks.push({
      beforeStart: mid.snakeStartX,
      beforeEnd: mid.snakeEndX,
      afterStart: mid.snakeStartY,
      afterEnd: mid.snakeEndY,
    });
    tasks.push({
      beforeStart: midX0,
      beforeEnd: mid.snakeStartX,
      afterStart: midY0,
      afterEnd: mid.snakeStartY,
    });
  }

  return { hunks: out };
}

/**
 * True when any line of the before-region also occurs in the after-region.
 * Pure-replace guard: no shared line means the optimal edit is exactly
 * delete-all + insert-all (no recursion needed). Set-based, so the guard is
 * O(sizeX + sizeY), not O(sizeX * sizeY).
 */
function regionsShareLine(
  before: readonly string[],
  x0: number,
  x1: number,
  after: readonly string[],
  y0: number,
  y1: number,
): boolean {
  const afterLines = new Set<string>();
  for (let j = y0; j < y1; j += 1) {
    afterLines.add(after[j]);
  }
  for (let i = x0; i < x1; i += 1) {
    if (afterLines.has(before[i])) {
      return true;
    }
  }
  return false;
}

interface MiddleSnake {
  readonly snakeStartX: number;
  readonly snakeEndX: number;
  readonly snakeStartY: number;
  readonly snakeEndY: number;
}

/**
 * Middle-snake search over [x0,x1) x [y0,y1) (Myers 1986, linear space).
 *
 * Canonical parity rules: the forward pass of step d meets the reverse
 * pass of step d-1 only when delta is odd; the reverse pass of step d
 * meets the forward pass of step d only when delta is even. Overlap
 * diagonals are k in [delta-(d-1), delta+(d-1)] (forward side) and
 * k in [-delta-(d-1), -delta+(d-1)] (reverse side) — parity-correct
 * because k and d share parity in each pass.
 *
 * Returns the snake split point. A degenerate (zero-length) found snake
 * means a pure-replace region; a midpoint split keeps both sub-frames
 * strictly smaller so the caller terminates. The pure-replace guard in
 * `diffLines` normally handles that case before reaching here.
 */
function middleSnake(
  before: readonly string[],
  x0: number,
  x1: number,
  after: readonly string[],
  y0: number,
  y1: number,
): MiddleSnake {
  const sizeX = x1 - x0;
  const sizeY = y1 - y0;
  const dMax = sizeX + sizeY;
  const delta = sizeX - sizeY;
  const oddDelta = delta % 2 !== 0;
  // Reach arrays indexed by k + base; slack on both ends.
  const base = dMax + 1;
  const vf = new Int32Array(2 * dMax + 3);
  const vr = new Int32Array(2 * dMax + 3);

  const midpointSplit = (): MiddleSnake => {
    const halfX = x0 + Math.ceil(sizeX / 2);
    const halfY = y0 + Math.ceil(sizeY / 2);
    return {
      snakeStartX: halfX,
      snakeEndX: halfX,
      snakeStartY: halfY,
      snakeEndY: halfY,
    };
  };

  for (let d = 0; d <= Math.ceil(dMax / 2) + 1; d++) {
    // ---- Forward pass (diagonals k with the parity of d). ----
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && vf[base + k - 1] < vf[base + k + 1])) {
        x = vf[base + k + 1];
      } else {
        x = vf[base + k - 1] + 1;
      }
      let y = x - k;
      while (x < sizeX && y < sizeY && before[x0 + x] === after[y0 + y]) {
        x += 1;
        y += 1;
      }
      vf[base + k] = x;
      // Odd delta: forward d can meet reverse d-1.
      if (
        oddDelta &&
        k >= delta - (d - 1) &&
        k <= delta + (d - 1) &&
        x >= sizeX - vr[base + (delta - k)]
      ) {
        // Overlap confirmed; extract the split snake as the longest common
        // run in the trimmed region (same rationale as the even branch).
        const snake = longestCommonRun(before, x0, x1, after, y0, y1);
        if (snake !== null) {
          return snake;
        }
        return midpointSplit();
      }
    }

    // ---- Reverse pass (diagonals k with the parity of d). ----
    // The reverse search runs on the REVERSED problem: coordinates are
    // measured from the far corner. vr[k] = reversed-x reach on diagonal k;
    // the real point is (sizeX - vr[k], sizeY - vr[k] - k).
    for (let k = -d; k <= d; k += 2) {
      let rx: number;
      if (k === -d || (k !== d && vr[base + k - 1] < vr[base + k + 1])) {
        rx = vr[base + k + 1];
      } else {
        rx = vr[base + k - 1] + 1;
      }
      let ry = rx - k;
      while (
        rx < sizeX &&
        ry < sizeY &&
        before[x1 - rx - 1] === after[y1 - ry - 1]
      ) {
        rx += 1;
        ry += 1;
      }
      vr[base + k] = rx;
      // Even delta: reverse d can meet forward d. The reverse point on
      // diagonal k maps to forward diagonal delta - k; overlap when the
      // forward reach plus the reverse reach covers sizeX.
      if (
        !oddDelta &&
        k >= -delta - (d - 1) &&
        k <= -delta + (d - 1) &&
        vf[base + (delta - k)] + rx >= sizeX
      ) {
        // Overlap confirmed at edit distance 2d. Extract the split snake:
        // the longest common run inside the region. The meeting interval
        // itself may sit on a diagonal with no common line while the true
        // middle snake lies on a neighbor diagonal, so search the whole
        // (already prefix/suffix-trimmed, hence change-bounded) region.
        const snake = longestCommonRun(before, x0, x1, after, y0, y1);
        if (snake !== null) {
          return snake;
        }
        return midpointSplit();
      }
    }
  }
  // Unreachable for non-empty trimmed regions; defensive midpoint split.
  return midpointSplit();
}

/**
 * Longest run of identical consecutive lines anywhere in the region, as a
 * MiddleSnake split point. Null when the regions share no line at all.
 * Dynamic programming over the (trimmed, change-bounded) region:
 * O(sizeX * sizeY) time, O(sizeY) space. Called only after Myers overlap
 * detection, on regions already stripped of common prefix/suffix.
 */
function longestCommonRun(
  before: readonly string[],
  x0: number,
  x1: number,
  after: readonly string[],
  y0: number,
  y1: number,
): MiddleSnake | null {
  const width = y1 - y0;
  // prev[j] = length of the longest common run ending at before[x0+i-1],
  // after[y0+j-1]; rolled row by row.
  let prev = new Int32Array(width + 1);
  let bestLen = 0;
  let bestEndX = -1;
  let bestEndY = -1;
  for (let i = 1; i <= x1 - x0; i += 1) {
    const current = new Int32Array(width + 1);
    for (let j = 1; j <= width; j += 1) {
      if (before[x0 + i - 1] === after[y0 + j - 1]) {
        const len = prev[j - 1] + 1;
        current[j] = len;
        if (len > bestLen) {
          bestLen = len;
          bestEndX = x0 + i;
          bestEndY = y0 + j;
        }
      }
    }
    prev = current;
  }
  if (bestLen === 0) {
    return null;
  }
  return {
    snakeStartX: bestEndX - bestLen,
    snakeEndX: bestEndX,
    snakeStartY: bestEndY - bestLen,
    snakeEndY: bestEndY,
  };
}

/** Flatten an edit script into per-line unified rows. */
export function unifiedDiffRows(
  before: readonly string[],
  after: readonly string[],
  script: LineDiffScript,
): UnifiedDiffRow[] {
  const rows: UnifiedDiffRow[] = [];
  let bi = 0;
  let ai = 0;
  for (const hunk of script.hunks) {
    for (let i = 0; i < hunk.count; i += 1) {
      if (hunk.op === "equal") {
        rows.push({ op: "equal", beforeNumber: bi + 1, afterNumber: ai + 1, text: before[bi] });
        bi += 1;
        ai += 1;
      } else if (hunk.op === "delete") {
        rows.push({ op: "delete", beforeNumber: bi + 1, afterNumber: null, text: before[bi] });
        bi += 1;
      } else {
        rows.push({ op: "insert", beforeNumber: null, afterNumber: ai + 1, text: after[ai] });
        ai += 1;
      }
    }
  }
  return rows;
}

/**
 * Side-by-side rows: delete/insert runs are paired row-by-row (Prism-style
 * alignment); the longer side pads with nulls. Equal lines pair 1:1.
 */
export function sideBySideDiffRows(rows: readonly UnifiedDiffRow[]): SideBySideDiffRow[] {
  const out: SideBySideDiffRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.op === "equal") {
      out.push({
        op: "equal",
        before: { number: row.beforeNumber, text: row.text },
        after: { number: row.afterNumber, text: row.text },
      });
      i += 1;
      continue;
    }
    // Collect the contiguous change block (deletes then inserts, or mixed).
    const deletes: UnifiedDiffRow[] = [];
    const inserts: UnifiedDiffRow[] = [];
    while (i < rows.length && rows[i].op !== "equal") {
      if (rows[i].op === "delete") deletes.push(rows[i]);
      else inserts.push(rows[i]);
      i += 1;
    }
    const pairs = Math.max(deletes.length, inserts.length);
    for (let p = 0; p < pairs; p += 1) {
      const del = deletes[p];
      const ins = inserts[p];
      const op: DiffOp = del && ins ? "replace" : del ? "delete" : "insert";
      out.push({
        op,
        before: del ? { number: del.beforeNumber, text: del.text } : null,
        after: ins ? { number: ins.afterNumber, text: ins.text } : null,
      });
    }
  }
  return out;
}

/** Honest `+added/-deleted` counters over the edit script. */
export function diffLineCounts(script: LineDiffScript): DiffLineCounts {
  let added = 0;
  let deleted = 0;
  for (const hunk of script.hunks) {
    if (hunk.op === "insert") added += hunk.count;
    else if (hunk.op === "delete") deleted += hunk.count;
  }
  return { added, deleted };
}

/** Convenience: full diff pipeline from two Markdown strings. */
export function computeLineDiff(beforeSource: string, afterSource: string) {
  const before = splitDiffLines(beforeSource);
  const after = splitDiffLines(afterSource);
  const script = diffLines(before, after);
  return {
    before,
    after,
    script,
    rows: unifiedDiffRows(before, after, script),
    counts: diffLineCounts(script),
  };
}
