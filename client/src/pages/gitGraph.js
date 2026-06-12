// Translates GET /api/git/graph history into a mermaid gitGraph
// (plans/git-graph.md). Mermaid's gitGraph is a REPLAYED command language,
// not a DAG renderer, so this works oldest-first with first-parent lane
// ownership (base claims the shared trunk, then HEAD's branch, then the
// rest) and degrades any inexpressible merge to a highlighted plain commit
// — a wrong-looking diagram is worse than a humble one.

// Lane names must be mermaid-identifier-safe; remote refs become tags.
const safe = (name) => name.replace(/[^A-Za-z0-9_-]/g, '-');
const escq = (s) => (s || '').replace(/["`;]/g, "'");

export function buildGitGraph(data) {
  const commits = [...(data?.commits || [])].reverse(); // oldest first
  if (commits.length < 2) return null;
  const inWindow = new Map(commits.map((c) => [c.hash, c]));
  const base = data.baseBranch || 'main';

  // Local branch tips become lanes; origin/* decorations become tags.
  const laneTips = new Map();
  const tags = new Map();
  for (const c of commits) {
    for (const r of c.refs || []) {
      if (r.startsWith('origin/')) {
        if (!tags.has(c.hash)) tags.set(c.hash, []);
        tags.get(c.hash).push(r);
      } else {
        laneTips.set(r, c.hash);
      }
    }
  }
  // "You are here": tag the current checkout's tip with HEAD.
  const headTip = laneTips.get(data.branch);
  if (headTip) {
    if (!tags.has(headTip)) tags.set(headTip, []);
    tags.get(headTip).unshift('HEAD');
  }

  // First-parent walks claim lane ownership, base first so it owns the trunk.
  const laneOf = new Map();
  const order = [
    base,
    ...(data.branch && data.branch !== base ? [data.branch] : []),
    ...[...laneTips.keys()].filter((n) => n !== base && n !== data.branch),
  ];
  for (const lane of order) {
    let h = laneTips.get(lane);
    while (h && inWindow.has(h) && !laneOf.has(h)) {
      laneOf.set(h, lane);
      h = inWindow.get(h).parents?.[0];
    }
  }
  for (const c of commits) if (!laneOf.has(c.hash)) laneOf.set(c.hash, base);

  // BT = newest at the top, like every other list in the tab — the user
  // couldn't tell past from future in the TB version.
  const lines = ['gitGraph BT:'];
  const created = new Set([safe(base)]);
  const emittedTip = new Map();
  let head = safe(base);

  for (const c of commits) {
    const lane = safe(laneOf.get(c.hash));
    if (!created.has(lane)) {
      const pLane = safe(laneOf.get(c.parents?.[0]) || base);
      if (head !== pLane && created.has(pLane)) {
        lines.push(`checkout ${pLane}`);
        head = pLane;
      }
      lines.push(`branch ${lane}`);
      created.add(lane);
      head = lane;
    } else if (head !== lane) {
      lines.push(`checkout ${lane}`);
      head = lane;
    }

    const tag = tags.has(c.hash) ? ` tag: "${escq(tags.get(c.hash).join(', '))}"` : '';
    const isMerge = (c.parents?.length || 0) > 1;
    if (isMerge) {
      const p2 = c.parents[1];
      const p2lane = safe(laneOf.get(p2) || '');
      // Expressible only when the second parent IS the emitted tip of a
      // different existing lane — otherwise degrade (never render wrong).
      if (p2lane && p2lane !== lane && created.has(p2lane) && emittedTip.get(p2lane) === p2) {
        lines.push(`merge ${p2lane}${tag}`);
        emittedTip.set(lane, c.hash);
        continue;
      }
      lines.push(`commit id: "${escq(c.short)} (merge)" type: HIGHLIGHT${tag}`);
      emittedTip.set(lane, c.hash);
      continue;
    }
    lines.push(`commit id: "${escq(c.short)}"${tag}`);
    emittedTip.set(lane, c.hash);
  }

  return `%%{init: {'gitGraph': {'mainBranchName': '${safe(base)}'}} }%%\n${lines.join('\n')}`;
}
