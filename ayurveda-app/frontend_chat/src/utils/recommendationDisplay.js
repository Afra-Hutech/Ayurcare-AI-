/** Short clinical summary for guide header (1–2 lines). */
export function compactClinicalSummary(text, maxLen = 200) {
  if (!text?.trim()) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxLen) return flat;
  const slice = flat.slice(0, maxLen);
  const breakAt = slice.lastIndexOf('. ');
  if (breakAt > 60) return `${slice.slice(0, breakAt + 1).trim()}`;
  const wordBreak = slice.lastIndexOf(' ');
  const cut = wordBreak > 60 ? slice.slice(0, wordBreak) : slice;
  return `${cut.trim()}…`;
}

/** Split long diet strings into readable bullets (e.g. "Diet: …; Hydration: …"). */
export function splitDietLines(raw) {
  const t = String(raw || '').trim();
  if (!t) return [];
  if (t.includes(';')) {
    return t.split(';').map((s) => s.trim()).filter(Boolean);
  }
  const labeled = t.split(/(?=\b(?:Hydration|Diet|Ahara|Favor|Reduce|apathya|pathya)\b)/i);
  if (labeled.length > 1) {
    return labeled.map((s) => s.trim()).filter(Boolean);
  }
  return [t];
}

/** Parse "Label: detail" diet tip into { label, detail }. */
export function parseDietTip(line) {
  const m = String(line || '').match(/^([^:]{3,40}):\s*(.+)$/s);
  if (m) {
    return { label: m[1].trim(), detail: m[2].trim() };
  }
  return { label: null, detail: String(line || '').trim() };
}

/** Split routine step "action — reason" for compact display. */
export function parseRoutineStep(step) {
  const s = String(step || '').trim();
  const dash = s.match(/^(.+?)\s*[—–-]\s+(.+)$/);
  if (dash) {
    return { action: dash[1].trim(), why: dash[2].trim() };
  }
  return { action: s, why: null };
}

function normRoutine(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[—–-]/g, '-')
    .trim();
}

function routineKeywords(line) {
  return new Set(
    normRoutine(line)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

function routinesAreSimilar(a, b) {
  const na = normRoutine(a);
  const nb = normRoutine(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = routineKeywords(a);
  const wb = routineKeywords(b);
  if (!wa.size || !wb.size) return false;
  let overlap = 0;
  for (const w of wa) {
    if (wb.has(w)) overlap += 1;
  }
  return overlap / Math.min(wa.size, wb.size) >= 0.45;
}

/** One clear line per phase — drop headlines duplicated by longer timeline text. */
export function dedupeRoutineLines(items = []) {
  if (!Array.isArray(items)) return [];

  let lines = items.map((x) => String(x || '').trim()).filter(Boolean);

  lines = lines.map((line) => {
    const dash = line.match(/^(.+?)\s*[—–-]\s+(.+)$/s);
    if (!dash) return line;
    const head = dash[1].trim();
    const tail = dash[2].trim();
    const h = normRoutine(head);
    const t = normRoutine(tail);
    if (t.includes(h) || h.length < 28) return tail;
    return line;
  });

  const kept = [];
  for (const line of lines) {
    const n = normRoutine(line);
    if (!n) continue;
    const matchIdx = kept.findIndex((k) => routinesAreSimilar(k, line));
    if (matchIdx >= 0) {
      if (line.length > kept[matchIdx].length) kept[matchIdx] = line;
      continue;
    }
    kept.push(line);
  }

  return kept.slice(0, 4);
}
