export interface DemoMenuIngredient {
  id: string
  name: string
  amount: string
  source: string
  ready: boolean
}

export interface DemoMenuStep {
  id: string
  title: string
  description: string
}

export interface DemoMenuRecipeInput {
  title: string
  description: string
  servings: number
  cookingMinutes: number
  ingredients: Array<Pick<DemoMenuIngredient, 'name' | 'amount' | 'source'>>
  steps: Array<Pick<DemoMenuStep, 'title' | 'description'>>
}

export interface DemoMenuRecipe extends DemoMenuRecipeInput {
  id: string
  ingredients: DemoMenuIngredient[]
  steps: DemoMenuStep[]
  createdAt: string
  updatedAt?: string
  image?: {
    src: string
    caption?: string
    mediaId?: string
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

function normalizeServings(value: number): number {
  return Number.isFinite(value) ? Math.min(12, Math.max(1, Math.round(value))) : 2
}

function normalizeCookingMinutes(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 30
}

function normalizeInput(
  input: DemoMenuRecipeInput,
  nowMs: number,
  idPrefix: string,
): Pick<DemoMenuRecipeInput, 'title' | 'description' | 'servings' | 'cookingMinutes'> & {
  ingredients: DemoMenuIngredient[]
  steps: DemoMenuStep[]
} {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    servings: normalizeServings(input.servings),
    cookingMinutes: normalizeCookingMinutes(input.cookingMinutes),
    ingredients: input.ingredients
      .map((item, index) => ({
        id: `${idPrefix}-ingredient-${nowMs}-${index}`,
        name: item.name.trim(),
        amount: item.amount.trim(),
        source: item.source.trim(),
        ready: false,
      }))
      .filter((item) => item.name),
    steps: input.steps
      .map((item, index) => ({
        id: `${idPrefix}-step-${nowMs}-${index}`,
        title: item.title.trim(),
        description: item.description.trim(),
      }))
      .filter((item) => item.title || item.description),
  }
}

export function createDemoMenuRecipe(
  input: DemoMenuRecipeInput,
  nowMs = Date.now(),
  idGenerator = () => `menu-${nowMs}`,
): DemoMenuRecipe {
  const id = idGenerator()
  return {
    id,
    ...normalizeInput(input, nowMs, id),
    createdAt: new Date(nowMs).toISOString(),
  }
}

export function updateDemoMenuRecipe(
  recipe: DemoMenuRecipe,
  input: DemoMenuRecipeInput,
  nowMs = Date.now(),
): DemoMenuRecipe {
  const previousIngredients = new Map(
    recipe.ingredients.map((item) => [item.name, item]),
  )
  const next = normalizeInput(input, nowMs, recipe.id)
  next.ingredients = next.ingredients.map((item) => {
    const previous = previousIngredients.get(item.name)
    return {
      ...item,
      id: previous?.id ?? item.id,
      ready: previous?.ready ?? false,
    }
  })

  return {
    ...recipe,
    ...next,
    updatedAt: new Date(nowMs).toISOString(),
  }
}

export function normalizeDemoMenuRecipe(
  recipe: DemoMenuRecipe,
  nowMs = Date.now(),
): DemoMenuRecipe {
  const id = recipe.id || `menu-${nowMs}`
  const normalized = normalizeInput(
    {
      title: recipe.title,
      description: recipe.description,
      servings: recipe.servings,
      cookingMinutes: recipe.cookingMinutes,
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps : [],
    },
    nowMs,
    id,
  )

  return {
    ...recipe,
    id,
    ...normalized,
    ingredients: normalized.ingredients.map((item, index) => ({
      ...item,
      id: recipe.ingredients[index]?.id || item.id,
      ready: recipe.ingredients[index]?.ready === true,
    })),
    steps: normalized.steps.map((item, index) => ({
      ...item,
      id: recipe.steps[index]?.id || item.id,
    })),
    createdAt: recipe.createdAt || new Date(nowMs).toISOString(),
  }
}

export function parseDemoMenuIngredients(text: string): Array<
  Pick<DemoMenuIngredient, 'name' | 'amount' | 'source'>
> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', amount = '', source = ''] = line.split('|').map((part) => part.trim())
      return { name, amount, source }
    })
    .filter((item) => item.name)
}

export function formatDemoMenuIngredients(
  ingredients: DemoMenuIngredient[],
): string {
  return ingredients
    .map((item) => [item.name, item.amount, item.source].filter(Boolean).join(' | '))
    .join('\n')
}

export function parseDemoMenuSteps(text: string): Array<
  Pick<DemoMenuStep, 'title' | 'description'>
> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title = '', description = ''] = line.split('|').map((part) => part.trim())
      return { title, description }
    })
    .filter((item) => item.title || item.description)
}

export function formatDemoMenuSteps(steps: DemoMenuStep[]): string {
  return steps
    .map((item) => [item.title, item.description].filter(Boolean).join(' | '))
    .join('\n')
}

export function createDemoMenuSeedRecipes(nowMs = Date.now()): DemoMenuRecipe[] {
  const tomatoBeef = createDemoMenuRecipe(
    {
      title: '番茄牛腩',
      description: '慢慢炖一锅，把冰箱里该吃掉的番茄用起来。',
      servings: 2,
      cookingMinutes: 55,
      ingredients: [
        { name: '牛腩', amount: '400g', source: '冰箱冷冻' },
        { name: '番茄', amount: '3 个', source: '冰箱冷藏' },
        { name: '土豆', amount: '2 个', source: '需要购买' },
        { name: '洋葱', amount: '半个', source: '厨房' },
      ],
      steps: [
        { title: '焯水', description: '牛腩冷水下锅，煮开后洗净浮沫。' },
        { title: '炒香', description: '番茄炒出汁，再放入牛腩和洋葱。' },
        { title: '慢炖', description: '加水炖 45 分钟，最后放土豆。' },
      ],
    },
    nowMs - DAY_MS,
    () => 'demo-menu-tomato-beef',
  )
  tomatoBeef.image = {
    src: '/images/demo-menu-still-life.jpg',
    caption: '公版静物 · 菜单版式示例',
  }

  return [
    tomatoBeef,
    createDemoMenuRecipe(
      {
        title: '葱油拌面',
        description: '二十分钟能端上桌，适合不想复杂做饭的晚上。',
        servings: 2,
        cookingMinutes: 20,
        ingredients: [
          { name: '细面', amount: '200g', source: '储物柜' },
          { name: '小葱', amount: '1 把', source: '冰箱冷藏' },
          { name: '生抽', amount: '2 勺', source: '调味架' },
        ],
        steps: [
          { title: '熬葱油', description: '冷油放葱段，小火熬到焦香。' },
          { title: '调汁', description: '生抽、老抽和一点糖拌匀。' },
          { title: '拌面', description: '面条煮熟后沥水，趁热拌匀。' },
        ],
      },
      nowMs - 2 * DAY_MS,
      () => 'demo-menu-scallion-noodles',
    ),
  ]
}
