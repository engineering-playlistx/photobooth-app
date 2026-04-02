import { describe, expect, it } from 'vitest'
import { validateModuleFlow } from './validate-module-flow'
import type { ModuleConfig } from '../types/module-config'
import type { AiThemeConfig } from '../types/event-config'

const VALID_AI_THEME: AiThemeConfig = {
  id: 'pitcrew',
  label: 'Pit Crew',
  prompt: 'A racing pit crew member',
  previewImageUrl: 'https://example.com/preview.png',
  frameImageUrl: 'https://example.com/frame.png',
  templateImageUrl: 'https://example.com/template.png',
  canvasWidth: 1080,
  canvasHeight: 1920,
  photoWidth: 1080,
  photoHeight: 1920,
  photoOffsetX: 0,
  photoOffsetY: 0,
}

const MINIMAL_VALID_FLOW: Array<ModuleConfig> = [
  { moduleId: 'welcome', position: 'fixed-first' },
  {
    moduleId: 'camera',
    position: 'fixed-camera',
    outputKey: 'originalPhoto',
    maxRetakes: 2,
  },
  { moduleId: 'result', position: 'fixed-last' },
]

const FULL_VALID_FLOW: Array<ModuleConfig> = [
  { moduleId: 'welcome', position: 'fixed-first' },
  {
    moduleId: 'theme-selection',
    position: 'pre-photo',
    outputKey: 'selectedTheme',
    themes: [
      {
        id: 'pitcrew',
        label: 'Pit Crew',
        previewImageUrl: 'https://example.com/preview.png',
      },
    ],
  },
  {
    moduleId: 'camera',
    position: 'fixed-camera',
    outputKey: 'originalPhoto',
    maxRetakes: 2,
  },
  {
    moduleId: 'ai-generation',
    position: 'post-photo',
    outputKey: 'finalPhoto',
    provider: 'replicate',
    themes: [VALID_AI_THEME],
  },
  { moduleId: 'form', position: 'post-photo', outputKey: 'userInfo' },
  { moduleId: 'result', position: 'fixed-last' },
]

describe('validateModuleFlow', () => {
  it('returns empty errors for a minimal valid flow', () => {
    expect(validateModuleFlow(MINIMAL_VALID_FLOW)).toEqual({})
  })

  it('returns empty errors for a fully-configured valid flow', () => {
    expect(validateModuleFlow(FULL_VALID_FLOW)).toEqual({})
  })

  it('errors on missing welcome module', () => {
    const flow = MINIMAL_VALID_FLOW.filter((m) => m.moduleId !== 'welcome')
    const errors = validateModuleFlow(flow)
    expect(errors).toHaveProperty('flow')
  })

  it('errors on missing result module', () => {
    const flow = MINIMAL_VALID_FLOW.filter((m) => m.moduleId !== 'result')
    const errors = validateModuleFlow(flow)
    expect(errors).toHaveProperty('flow')
  })

  it('errors when theme-selection and ai-generation have mismatched theme IDs', () => {
    const flow: Array<ModuleConfig> = [
      { moduleId: 'welcome', position: 'fixed-first' },
      {
        moduleId: 'theme-selection',
        position: 'pre-photo',
        outputKey: 'selectedTheme',
        themes: [{ id: 'motogp', label: 'MotoGP', previewImageUrl: '' }],
      },
      {
        moduleId: 'camera',
        position: 'fixed-camera',
        outputKey: 'originalPhoto',
        maxRetakes: 2,
      },
      {
        moduleId: 'ai-generation',
        position: 'post-photo',
        outputKey: 'finalPhoto',
        provider: 'replicate',
        themes: [{ ...VALID_AI_THEME, id: 'pitcrew' }],
      },
      { moduleId: 'result', position: 'fixed-last' },
    ]
    const errors = validateModuleFlow(flow)
    expect(errors).toHaveProperty('themes')
  })

  it('errors when camera maxRetakes is 0', () => {
    const flow: Array<ModuleConfig> = [
      { moduleId: 'welcome', position: 'fixed-first' },
      {
        moduleId: 'camera',
        position: 'fixed-camera',
        outputKey: 'originalPhoto',
        maxRetakes: 0,
      },
      { moduleId: 'result', position: 'fixed-last' },
    ]
    const errors = validateModuleFlow(flow)
    expect(errors).toHaveProperty('camera.maxRetakes')
  })

  it('errors when an AI theme has an empty prompt', () => {
    const flow: Array<ModuleConfig> = [
      { moduleId: 'welcome', position: 'fixed-first' },
      {
        moduleId: 'camera',
        position: 'fixed-camera',
        outputKey: 'originalPhoto',
        maxRetakes: 2,
      },
      {
        moduleId: 'ai-generation',
        position: 'post-photo',
        outputKey: 'finalPhoto',
        provider: 'replicate',
        themes: [{ ...VALID_AI_THEME, prompt: '' }],
      },
      { moduleId: 'result', position: 'fixed-last' },
    ]
    const errors = validateModuleFlow(flow)
    expect(errors).toHaveProperty('aiTheme[0].prompt')
  })
})
