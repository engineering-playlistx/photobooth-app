import type { ModuleConfig } from './module-config'

export interface EventConfig {
  eventId: string
  branding: BrandingConfig
  moduleFlow: Array<ModuleConfig>
  formFields: FormFieldsConfig
  techConfig: TechConfig
}

export interface FontEntry {
  family: string
  url: string
}

export interface BrandingConfig {
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  fonts: FontEntry[]
  backgroundUrl: string | null
  portalHeading: string | null
  screenBackgrounds: Record<string, string | null> | null
}

export interface AiThemeConfig {
  id: string
  label: string
  previewImageUrl: string
  frameImageUrl: string
  templateImageUrl: string
  prompt: string
  canvasWidth: number
  canvasHeight: number
  photoWidth: number
  photoHeight: number
  photoOffsetX: number
  photoOffsetY: number
}

export interface FormFieldsConfig {
  name: boolean
  email: boolean
  phone: boolean
  consent: boolean
}

export interface TechConfig {
  printerName: string
  inactivityTimeoutSeconds: number
  inactivityWarningSeconds?: number
  guestPortalEnabled: boolean
}
