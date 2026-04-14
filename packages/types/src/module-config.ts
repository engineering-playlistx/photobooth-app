import type { AiThemeConfig } from './event-config'

export interface ElementCustomization {
  copy?: string // text override for this element (if it renders text)
  css?: string // raw CSS string applied to this specific element
}

export interface ModuleCustomization {
  elements?: Record<string, ElementCustomization> // keyed by element name
}

// Element key catalogs per module (keys must match component pb-<moduleId>-<elementKey> class names):
// WelcomeModule:         ctaButton                                — "Tap to Start" button
// ThemeSelectionModule:  header, themeCard                       — h1 title; theme selection cards
// CameraModule:          retakeButton, captureButton, nextButton  — camera control buttons
// AiGenerationModule:    statusText                              — progress bar status text
// FormModule:            header, submitButton                    — form title h1; "Confirm" button
// ResultModule:          header, printButton, retryButton, backButton

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
  customization?: ModuleCustomization
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
  slideshowItems?: {
    imageUrl?: string
    caption?: string
  }[]
}

export interface FormModuleConfig extends BaseModuleConfig {
  moduleId: 'form'
  position: 'post-photo'
  outputKey: 'userInfo'
}

export interface ResultModuleConfig extends BaseModuleConfig {
  moduleId: 'result'
  position: 'fixed-last'
  emailEnabled?: boolean // undefined treated as true (backward compatible)
  qrCodeEnabled?: boolean // undefined treated as true
  printEnabled?: boolean // undefined treated as true
  retryEnabled?: boolean // undefined treated as false (opt-in)
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
