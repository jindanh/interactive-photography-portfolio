/**
 * Square min-cost assignment (Hungarian / Jonker-style shortest augmenting
 * paths with potentials), O(n^3). cost is row-major n*n. Returns row -> col.
 * Deterministic; ties go to the lowest index.
 */
export function hungarian(cost: Float64Array, n: number): Int32Array {
  const INF = Infinity;
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1); // p[j] = row matched to column j (1-based, 0 = none)
  const way = new Int32Array(n + 1);
  const minv = new Float64Array(n + 1);
  const used = new Uint8Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    minv.fill(INF);
    used.fill(0);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[(i0 - 1) * n + (j - 1)] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const rowToCol = new Int32Array(n);
  for (let j = 1; j <= n; j++) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}
