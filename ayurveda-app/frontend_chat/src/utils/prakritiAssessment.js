/** Prakriti (body constitution) self-assessment — shared by UI and Vaidya AI sync */

export const PRAKRITI_STORAGE_KEY = 'patient_prakriti_profile_v2'

export const PRAKRITI_CATEGORIES = {
  build: { label: 'Build & frame', emoji: '🧍' },
  digestion: { label: 'Digestion & appetite', emoji: '🔥' },
  sleep: { label: 'Sleep & rest', emoji: '🌙' },
  mind: { label: 'Mind & focus', emoji: '🧠' },
  weather: { label: 'Climate sensitivity', emoji: '🌤️' },
  stress: { label: 'Stress response', emoji: '💨' },
  movement: { label: 'Energy & movement', emoji: '⚡' },
  skin: { label: 'Skin & hair', emoji: '✨' },
  speech: { label: 'Speech & pace', emoji: '💬' },
  seasons: { label: 'Seasonal shifts', emoji: '🍂' },
  cravings: { label: 'Food cravings', emoji: '🥗' },
  routine: { label: 'Daily rhythm', emoji: '⏰' },
}

export const PRAKRITI_QUESTIONS = [
  {
    id: 'build',
    category: 'build',
    text: 'Which best describes your natural build (since childhood)?',
    options: [
      { label: 'Lean, light frame; hard to gain weight', v: 2, p: 0, k: 0 },
      { label: 'Medium, athletic when active', v: 0, p: 2, k: 0 },
      { label: 'Broader frame; gains weight easily', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'digestion',
    category: 'digestion',
    text: 'Your digestion and appetite are usually…',
    options: [
      { label: 'Irregular; bloating or gas when stressed', v: 2, p: 0, k: 0 },
      { label: 'Strong hunger; acidity if meals are heavy', v: 0, p: 2, k: 0 },
      { label: 'Slow but steady; fullness lasts long', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'sleep',
    category: 'sleep',
    text: 'Your typical sleep pattern:',
    options: [
      { label: 'Light sleep; wakes easily; vivid dreams', v: 2, p: 0, k: 0 },
      { label: 'Moderate; irritable if sleep is cut short', v: 0, p: 2, k: 0 },
      { label: 'Deep, long sleep; hard to wake', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'mind',
    category: 'mind',
    text: 'When learning something new, you tend to…',
    options: [
      { label: 'Grasp quickly, forget unless rehearsed', v: 2, p: 0, k: 0 },
      { label: 'Focus sharply; debate your point', v: 0, p: 2, k: 0 },
      { label: 'Learn slowly but retain well', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'weather',
    category: 'weather',
    text: 'Weather you tolerate least:',
    options: [
      { label: 'Cold, dry, windy days', v: 2, p: 0, k: 0 },
      { label: 'Hot, humid afternoons', v: 0, p: 2, k: 0 },
      { label: 'Damp, chilly mornings', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'stress',
    category: 'stress',
    text: 'Under pressure you become…',
    options: [
      { label: 'Worried, restless, scattered', v: 2, p: 0, k: 0 },
      { label: 'Sharp, critical, overheated', v: 0, p: 2, k: 0 },
      { label: 'Withdrawn, sluggish, avoidant', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'movement',
    category: 'movement',
    text: 'Preferred pace of activity:',
    options: [
      { label: 'Bursts of energy, then tired', v: 2, p: 0, k: 0 },
      { label: 'Competitive, goal-driven', v: 0, p: 2, k: 0 },
      { label: 'Steady; prefers routine', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'skin',
    category: 'skin',
    text: 'Your skin and hair tend to be…',
    options: [
      { label: 'Dry or rough; cracks in winter', v: 2, p: 0, k: 0 },
      { label: 'Warm, oily, sensitive or reddish', v: 0, p: 2, k: 0 },
      { label: 'Soft, thick, well-hydrated', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'speech',
    category: 'speech',
    text: 'Your speech and conversation style:',
    options: [
      { label: 'Fast, many ideas; changes topics', v: 2, p: 0, k: 0 },
      { label: 'Precise, persuasive, intense', v: 0, p: 2, k: 0 },
      { label: 'Calm, measured, few words', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'seasons',
    category: 'seasons',
    text: 'Seasonal changes affect you most by…',
    options: [
      { label: 'Anxiety or dryness in autumn/winter', v: 2, p: 0, k: 0 },
      { label: 'Heat, rashes, or irritability in summer', v: 0, p: 2, k: 0 },
      { label: 'Heaviness or congestion in spring', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'cravings',
    category: 'cravings',
    text: 'You most often crave…',
    options: [
      { label: 'Dry, crunchy, or raw foods', v: 2, p: 0, k: 0 },
      { label: 'Spicy, salty, or sour foods', v: 0, p: 2, k: 0 },
      { label: 'Sweet, creamy, or heavy foods', v: 0, p: 0, k: 2 },
    ],
  },
  {
    id: 'routine',
    category: 'routine',
    text: 'Your daily routine is…',
    options: [
      { label: 'Variable; hard to stick to schedules', v: 2, p: 0, k: 0 },
      { label: 'Structured when motivated; intense phases', v: 0, p: 2, k: 0 },
      { label: 'Regular; dislikes sudden change', v: 0, p: 0, k: 2 },
    ],
  },
]

export function computePrakritiScores(answers) {
  let v = 0
  let p = 0
  let k = 0
  PRAKRITI_QUESTIONS.forEach((q) => {
    const idx = answers[q.id]
    if (idx == null || !q.options[idx]) return
    const o = q.options[idx]
    v += o.v
    p += o.p
    k += o.k
  })
  const sum = v + p + k || 1
  return {
    vata: Math.round((v / sum) * 100),
    pitta: Math.round((p / sum) * 100),
    kapha: Math.round((k / sum) * 100),
    raw: { v, p, k },
  }
}

export function dominantPrakritiLabel(scores) {
  const { vata, pitta, kapha } = scores
  const max = Math.max(vata, pitta, kapha)
  const ties = [
    vata === max && 'Vata',
    pitta === max && 'Pitta',
    kapha === max && 'Kapha',
  ].filter(Boolean)
  if (ties.length >= 2) return `${ties.join('–')} blend`
  return ties[0] || 'Balanced'
}

export function buildPrakritiProfilePayload(answers) {
  const scores = computePrakritiScores(answers)
  const dominant = dominantPrakritiLabel(scores)
  return {
    prakritiProfile: {
      vata: scores.vata,
      pitta: scores.pitta,
      kapha: scores.kapha,
      dominant,
      constitution: dominant,
      answers,
      completedAt: new Date().toISOString(),
      source: 'self_assessment_v2',
      questionCount: PRAKRITI_QUESTIONS.length,
    },
  }
}

export function prakritiInsights(dominant) {
  const d = String(dominant || '').toLowerCase()
  if (d.includes('vata')) {
    return 'Warm, grounding routines and regular meal times help balance Vata. Vaidya AI will factor this into diet and lifestyle suggestions.'
  }
  if (d.includes('pitta')) {
    return 'Cooling foods, moderation in heat and intensity, and calm evenings support Pitta balance.'
  }
  if (d.includes('kapha')) {
    return 'Light activity, warming spices, and variety in meals help keep Kapha energy flowing.'
  }
  return 'A balanced blend suggests flexibility — seasonal adjustments matter most for you.'
}
