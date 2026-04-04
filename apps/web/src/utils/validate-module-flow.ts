import type {
  AiGenerationModuleConfig,
  ModuleConfig,
  ThemeSelectionModuleConfig,
} from '@photobooth/types'

export function validateModuleFlow(
  moduleFlow: Array<ModuleConfig>,
): Record<string, string> {
  const errors: Record<string, string> = {}

  // Required singletons
  const welcomeCount = moduleFlow.filter((m) => m.moduleId === 'welcome').length
  if (welcomeCount !== 1)
    errors['flow'] = 'Flow must have exactly one Welcome module'

  const cameraCount = moduleFlow.filter((m) => m.moduleId === 'camera').length
  if (cameraCount !== 1)
    errors['flow'] = 'Flow must have exactly one Camera module'

  const resultCount = moduleFlow.filter((m) => m.moduleId === 'result').length
  if (resultCount !== 1)
    errors['flow'] = 'Flow must have exactly one Result module'

  // At-most-one constraints
  if (moduleFlow.filter((m) => m.moduleId === 'theme-selection').length > 1)
    errors['flow'] = 'Flow can have at most one Theme Selection module'

  if (moduleFlow.filter((m) => m.moduleId === 'ai-generation').length > 1)
    errors['flow'] = 'Flow can have at most one AI Generation module'

  if (moduleFlow.filter((m) => m.moduleId === 'form').length > 1)
    errors['flow'] = 'Flow can have at most one Form module'

  // Theme ID sync check
  const ts = moduleFlow.find(
    (m): m is ThemeSelectionModuleConfig => m.moduleId === 'theme-selection',
  )
  const ai = moduleFlow.find(
    (m): m is AiGenerationModuleConfig => m.moduleId === 'ai-generation',
  )
  if (ts && ai) {
    const tsIds = ts.themes.map((t) => t.id).sort()
    const aiIds = ai.themes.map((t) => t.id).sort()
    if (JSON.stringify(tsIds) !== JSON.stringify(aiIds))
      errors['themes'] =
        'Theme IDs in Theme Selection must match those in AI Generation'
  }

  // Camera maxRetakes
  const camera = moduleFlow.find(
    (m): m is Extract<ModuleConfig, { moduleId: 'camera' }> =>
      m.moduleId === 'camera',
  )
  if (camera) {
    if (!Number.isInteger(camera.maxRetakes) || camera.maxRetakes < 1)
      errors['camera.maxRetakes'] = 'Max Retakes must be a positive integer'
  }

  // AI theme field validation
  if (ai) {
    ai.themes.forEach((t, i) => {
      if (!t.id) errors[`aiTheme[${i}].id`] = 'Theme ID is required'
      if (!t.label) errors[`aiTheme[${i}].label`] = 'Label is required'
      if (!t.prompt) errors[`aiTheme[${i}].prompt`] = 'Prompt is required'
      if (!t.previewImageUrl)
        errors[`aiTheme[${i}].previewImageUrl`] =
          'Preview image URL is required'
      if (!t.frameImageUrl)
        errors[`aiTheme[${i}].frameImageUrl`] = 'Frame image URL is required'
      if (!t.templateImageUrl)
        errors[`aiTheme[${i}].templateImageUrl`] =
          'Template image URL is required'
      const posDims: Array<keyof typeof t> = [
        'canvasWidth',
        'canvasHeight',
        'photoWidth',
        'photoHeight',
      ]
      posDims.forEach((dim) => {
        const v = t[dim] as number
        if (!Number.isInteger(v) || v <= 0)
          errors[`aiTheme[${i}].${dim}`] =
            `${String(dim)} must be a positive integer`
      })
      const offsets: Array<keyof typeof t> = ['photoOffsetX', 'photoOffsetY']
      offsets.forEach((dim) => {
        const v = t[dim] as number
        if (!Number.isInteger(v) || v < 0)
          errors[`aiTheme[${i}].${dim}`] =
            `${String(dim)} must be a non-negative integer`
      })
    })
  }

  // Mini-quiz validation
  moduleFlow
    .filter(
      (m): m is Extract<ModuleConfig, { moduleId: 'mini-quiz' }> =>
        m.moduleId === 'mini-quiz',
    )
    .forEach((mq, qi) => {
      mq.questions.forEach((q, qIdx) => {
        if (!q.text)
          errors[`quiz[${qi}].question[${qIdx}]`] = 'Question text is required'
        if (q.options.length < 2)
          errors[`quiz[${qi}].options[${qIdx}]`] =
            'Each question must have at least 2 options'
        else if (q.options.some((o) => !o))
          errors[`quiz[${qi}].options[${qIdx}]`] = 'Options cannot be empty'
      })
    })

  return errors
}
