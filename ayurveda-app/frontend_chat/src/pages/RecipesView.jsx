import React from 'react'
import { Clock, Leaf, ListChecks, ShieldAlert, Sparkles, UtensilsCrossed } from 'lucide-react'

const SECTION_LABELS = {
  benefits: 'Benefits',
  ingredients: 'Ingredients',
  preparation: 'How to make',
  timing: 'When to take',
  precautions: 'Precautions',
}

const SECTION_META = {
  benefits: { icon: Sparkles, tone: 'emerald' },
  ingredients: { icon: UtensilsCrossed, tone: 'amber' },
  preparation: { icon: ListChecks, tone: 'teal' },
  timing: { icon: Clock, tone: 'indigo' },
  precautions: { icon: ShieldAlert, tone: 'rose' },
}

const SECTION_EMPTY_HINTS = {
  ingredients: 'Ingredient list missing — open Wellness Plan again after your report finishes generating.',
  preparation: 'Steps missing — refresh the wellness plan from chat.',
  timing: 'Timing not specified — ask your practitioner when to take this.',
  benefits: 'Benefits not listed — regenerate the wellness plan or discuss with your doctor.',
}

const INLINE_SECTION_PATTERNS = [
  { key: 'title', regex: /(?:name of the dish(?:\/recipe)?|recipe name|dish name|name|title):/i },
  { key: 'benefits', regex: /benefits?:/i },
  { key: 'ingredients', regex: /ingredients?:/i },
  {
    key: 'preparation',
    regex: /(?:how to make|preparation steps|preparation|method|instructions|directions|steps):/i,
  },
  {
    key: 'timing',
    regex: /(?:what time to take|time to take|when to consume|when to take|best time to consume|best time to take|timing):/i,
  },
  { key: 'precautions', regex: /precautions?:/i },
]

function normalizeLine(line) {
  return line
    .replace(/^[#*\-\d.\s]+/, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSectionKey(line) {
  const lowered = line.toLowerCase().replace(/[*#]/g, '').trim()

  if (lowered.startsWith('benefits:') || lowered.startsWith('benefit:')) return 'benefits'
  if (lowered.startsWith('ingredients:') || lowered.startsWith('ingredient:')) return 'ingredients'
  if (
    lowered.startsWith('how to make:')
    || lowered.startsWith('preparation steps:')
    || lowered.startsWith('preparation:')
    || lowered.startsWith('method:')
    || lowered.startsWith('instructions:')
    || lowered.startsWith('directions:')
    || lowered.startsWith('steps:')
  ) {
    return 'preparation'
  }
  if (
    lowered.startsWith('what time to take:')
    || lowered.startsWith('time to take:')
    || lowered.startsWith('when to consume:')
    || lowered.startsWith('when to take:')
    || lowered.startsWith('timing:')
    || lowered.startsWith('best time to consume:')
    || lowered.startsWith('best time to take:')
  ) {
    return 'timing'
  }
  if (lowered.startsWith('precautions:') || lowered.startsWith('precaution:')) return 'precautions'

  return null
}

function toBulletItems(text) {
  let list = text.split(/\n+/)
  if (list.length === 1 && text.match(/[\-\*]\s+/)) {
    list = text.split(/[\-\*]\s+/)
  } else if (list.length === 1) {
    list = text.split(/,(?=[A-Za-z])/)
  }

  return list.map((item) => normalizeLine(item)).filter(Boolean)
}

function toStepItems(text) {
  let list = text.split(/\n+/)
  if (list.length === 1 && text.match(/\d+\.\s/)) {
    list = text.split(/(?=\d+\.\s)/)
  } else if (list.length === 1) {
    list = text.split(/\.\s+(?=[A-Z])/)
  }

  return list
    .map((step) => normalizeLine(step.replace(/^\d+[\.\)]\s*/, '').trim()))
    .filter(Boolean)
}

function parseInlineSections(block) {
  const cleanBlock = block.replace(/[*#_`]/g, '')
  const recipe = {
    title: '',
    intro: [],
    benefits: [],
    ingredients: [],
    preparation: [],
    timing: [],
    precautions: [],
  }

  const matches = INLINE_SECTION_PATTERNS
    .map((section) => {
      const match = cleanBlock.match(section.regex)
      return match ? { ...section, position: match.index, length: match[0].length } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position)

  if (matches.length === 0) return null

  if (matches[0].position > 0 && !matches.find((m) => m.key === 'title')) {
    const fallbackTitleRaw = cleanBlock.slice(0, matches[0].position).trim()
    if (fallbackTitleRaw) {
      recipe.title = normalizeLine(fallbackTitleRaw.replace(/^(?:recipe ?\d*\s*:?|-?\s*name:?)\s*/i, '')).trim()
    }
  }

  matches.forEach((match, idx) => {
    const start = match.position + match.length
    const end = matches[idx + 1]?.position ?? cleanBlock.length
    const value = cleanBlock.slice(start, end).trim()
    if (!value) return

    if (match.key === 'title') {
      recipe.title = value
      return
    }

    if (match.key === 'ingredients') {
      recipe.ingredients.push(...toBulletItems(value))
      return
    }

    if (match.key === 'preparation') {
      recipe.preparation.push(...toStepItems(value))
      return
    }

    recipe[match.key].push(value)
  })

  return recipe
}

function parseRecipeBlock(block) {
  const inlineRecipe = parseInlineSections(block)
  if (inlineRecipe) return inlineRecipe

  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
  const recipe = {
    title: '',
    intro: [],
    benefits: [],
    ingredients: [],
    preparation: [],
    timing: [],
    precautions: [],
  }

  let activeSection = 'intro'

  lines.forEach((rawLine, lineIndex) => {
    const numbered = rawLine.match(/^\d+\.\s*\*\*(.+?)\*\*[:\s]*(.*)$/)
    if (numbered) {
      recipe.title = normalizeLine(numbered[1])
      if (numbered[2].trim()) {
        recipe.benefits.push(normalizeLine(numbered[2]))
      }
      return
    }

    const sectionKey = getSectionKey(rawLine)

    if (lineIndex === 0 && !sectionKey) {
      recipe.title = normalizeLine(rawLine)
      return
    }

    if (sectionKey) {
      activeSection = sectionKey
      const value = rawLine.split(':').slice(1).join(':').trim()
      if (!value) return

      if (sectionKey === 'ingredients') {
        recipe[sectionKey].push(...toBulletItems(value))
      } else if (sectionKey === 'preparation') {
        recipe[sectionKey].push(...toStepItems(value))
      } else {
        recipe[sectionKey].push(normalizeLine(value))
      }
      return
    }

    const cleanLine = normalizeLine(rawLine)
    if (!cleanLine) return

    if (activeSection === 'ingredients') {
      recipe.ingredients.push(...toBulletItems(cleanLine))
      return
    }

    if (activeSection === 'preparation') {
      recipe.preparation.push(...toStepItems(cleanLine))
      return
    }

    recipe[activeSection].push(cleanLine)
  })

  return recipe
}

function hasRecipeSections(recipe) {
  return Boolean(
    recipe.ingredients.length
    || recipe.preparation.length
    || recipe.timing.length
    || recipe.precautions.length
    || recipe.benefits.length
  )
}

function isIntroOnlyBlock(recipe) {
  return !hasRecipeSections(recipe) && Boolean(recipe.title || recipe.intro.length)
}

function parseRecipes(recipes) {
  const blocks = recipes
    .split(/---RECIPE---/i)
    .map((block) => block.trim())
    .filter(Boolean)

  const parsedRecipes = blocks.map(parseRecipeBlock)
  let intro = ''

  if (parsedRecipes.length > 0 && parsedRecipes[0] && isIntroOnlyBlock(parsedRecipes[0])) {
    intro = [parsedRecipes[0].title, ...parsedRecipes[0].intro].filter(Boolean).join(' ')
    parsedRecipes.shift()
  }

  return { intro, recipes: parsedRecipes }
}

const toneStyles = {
  emerald: 'border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/30',
  amber: 'border-amber-100 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30',
  teal: 'border-teal-100 bg-teal-50/60 dark:border-teal-900/50 dark:bg-teal-950/30',
  indigo: 'border-indigo-100 bg-indigo-50/60 dark:border-indigo-900/50 dark:bg-indigo-950/30',
  rose: 'border-rose-100 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/30',
}

const iconTone = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  teal: 'text-teal-600 dark:text-teal-400',
  indigo: 'text-indigo-600 dark:text-indigo-400',
  rose: 'text-rose-600 dark:text-rose-400',
}

function RecipeSection({ sectionKey, items, variant = 'bullets', emptyHint = null }) {
  const title = SECTION_LABELS[sectionKey]
  const meta = SECTION_META[sectionKey]
  const hasItems = items.length > 0
  if (!hasItems && !emptyHint) return null

  const Icon = meta.icon
  const spanClass = sectionKey === 'preparation' ? 'md:col-span-2' : ''

  return (
    <section className={`rounded-lg border p-3 ${toneStyles[meta.tone]} ${spanClass}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconTone[meta.tone]}`} />
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{title}</h3>
      </div>

      {!hasItems ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">{emptyHint}</p>
      ) : variant === 'steps' ? (
        <ol className="space-y-1.5">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-xs text-slate-700 dark:text-slate-200 leading-snug">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/80 dark:bg-slate-900/60 text-[10px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                {index + 1}
              </span>
              <span className="pt-0.5">{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="space-y-1">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-xs text-slate-700 dark:text-slate-200 leading-snug">
              <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function WellnessHeader({ embedded }) {
  if (embedded) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 shadow-sm">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <Leaf className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Pathya · Wellness</p>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">Your personalised plan</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            Three Ayurvedic recipes with ingredients, steps, timing, and precautions from your report.
          </p>
        </div>
      </div>
    )
  }

  return (
    <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Personalised plan</p>
      <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">Ayurvedic wellness plan</h1>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-snug">
        Recipes tailored to your constitution and clinical report.
      </p>
    </header>
  )
}

export default function RecipesView({ recipes, embedded = false }) {
  if (!recipes || !String(recipes).trim()) {
    return (
      <div className={`flex flex-col ${embedded ? 'h-full' : 'min-h-[200px]'}`}>
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
            <Leaf className="h-5 w-5 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No wellness plan yet</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[240px] leading-snug">
            Complete a consultation and generate your report, then open Wellness Plan from chat.
          </p>
        </div>
      </div>
    )
  }

  const { intro, recipes: parsedRecipes } = parseRecipes(recipes)
  const visibleRecipes = parsedRecipes
    .filter((r) => r.title && (hasRecipeSections(r) || r.ingredients.length > 0))
    .slice(0, 3)

  const sectionOrder = ['benefits', 'ingredients', 'preparation', 'timing', 'precautions']

  return (
    <div className={`recipes-view flex flex-col w-full bg-slate-50/80 dark:bg-slate-950 ${embedded ? 'h-full' : 'min-h-full'}`}>
      {!embedded && <WellnessHeader embedded={false} />}

      <div className={`flex flex-col gap-3 ${embedded ? 'p-2.5' : 'p-4 max-w-3xl mx-auto w-full'}`}>
        {embedded && <WellnessHeader embedded />}

        {visibleRecipes.length > 0 && visibleRecipes.length < 3 && (
          <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 rounded-md px-2.5 py-1.5">
            Showing {visibleRecipes.length} of 3 recipes — reopen Wellness Plan to refresh.
          </p>
        )}

        {visibleRecipes.length === 0 && (
          <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{intro || recipes}</p>
          </section>
        )}

        {visibleRecipes.map((recipe, idx) => (
          <article
            key={`${recipe.title}-${idx}`}
            className="rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/50 px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-[11px] font-bold text-white">
                {idx + 1}
              </span>
              {recipe.title && (
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">{recipe.title}</h2>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2.5">
              {sectionOrder.map((key) => (
                <RecipeSection
                  key={key}
                  sectionKey={key}
                  items={recipe[key]}
                  variant={key === 'preparation' ? 'steps' : 'bullets'}
                  emptyHint={SECTION_EMPTY_HINTS[key]}
                />
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
