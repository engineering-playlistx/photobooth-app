export interface EventConfig {
  eventId: string;
  branding: BrandingConfig;
  moduleFlow: string[]; // stub — ordered list of step IDs
  formFields: FormFieldsConfig;
  aiConfig: AiConfig;
  techConfig: TechConfig;
}

export interface BrandingConfig {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string | null;
  backgroundUrl: string | null;
}

export interface AiThemeConfig {
  id: string;
  label: string;
  previewImageUrl: string;
  frameImageUrl: string;
  templateImageUrl: string;
  prompt: string;
  canvasWidth: number;
  canvasHeight: number;
  photoWidth: number;
  photoHeight: number;
  photoOffsetX: number;
  photoOffsetY: number;
}

export interface AiConfig {
  provider: "replicate" | "google";
  themes: AiThemeConfig[];
}

export interface FormFieldsConfig {
  name: boolean;
  email: boolean;
  phone: boolean;
  consent: boolean;
}

export interface TechConfig {
  printerName: string;
  inactivityTimeoutSeconds: number;
  guestPortalEnabled: boolean;
}
