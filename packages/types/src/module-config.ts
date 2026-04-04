import type { AiThemeConfig } from './event-config'

export type ModulePosition =
  | 'fixed-first'
  | 'pre-photo'
  | 'fixed-camera'
  | 'post-photo'
  | 'fixed-last'
  | 'flexible'

export interface BaseModuleConfig {
  moduleId: string
  position: ModulePosition
  outputKey?: string // key this module writes into moduleOutputs
}

export interface WelcomeModuleConfig extends BaseModuleConfig {
  moduleId: 'welcome'
  position: 'fixed-first'
}

export interface CameraModuleConfig extends BaseModuleConfig {
  moduleId: 'camera'
  position: 'fixed-camera'
  outputKey: 'originalPhoto'
  maxRetakes: number // default: 2
}

export interface ThemeSelectionModuleConfig extends BaseModuleConfig {
  moduleId: 'theme-selection'
  position: 'pre-photo'
  outputKey: 'selectedTheme'
  themes: Array<{
    id: string
    label: string
    previewImageUrl: string
  }>
}

export interface AiGenerationModuleConfig extends BaseModuleConfig {
  moduleId: 'ai-generation'
  position: 'post-photo'
  outputKey: 'finalPhoto'
  provider: 'replicate' | 'google'
  themes: Array<AiThemeConfig> // moved here from top-level aiConfig
}

export interface FormModuleConfig extends BaseModuleConfig {
  moduleId: 'form'
  position: 'post-photo'
  outputKey: 'userInfo'
}

export interface ResultModuleConfig extends BaseModuleConfig {
  moduleId: 'result'
  position: 'fixed-last'
}

export interface MiniQuizModuleConfig extends BaseModuleConfig {
  moduleId: 'mini-quiz'
  position: 'flexible'
  outputKey: 'quizAnswer'
  questions: Array<{
    text: string
    options: Array<string>
  }>
}

export type ModuleConfig =
  | WelcomeModuleConfig
  | CameraModuleConfig
  | ThemeSelectionModuleConfig
  | AiGenerationModuleConfig
  | FormModuleConfig
  | ResultModuleConfig
  | MiniQuizModuleConfig
