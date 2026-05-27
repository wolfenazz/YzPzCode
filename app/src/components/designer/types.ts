export type DesignerThemeId =
  | 'terminal-pro'
  | 'minimal-saas'
  | 'futuristic-dark'
  | 'neon-cyberpunk'
  | 'clean-dashboard'
  | 'glassmorphism'
  | 'luxury-editorial'
  | 'apple-inspired'
  | 'material-design'
  | 'brutalist'
  | 'mobile-first'
  | 'developer-portfolio'
  | 'enterprise-admin'
  | 'soft-gradient';

export type DesignerDevice = 'responsive' | 'desktop' | 'tablet' | 'mobile';
export type DesignerPageType = 'landing' | 'website' | 'dashboard' | 'mobile-app' | 'form' | 'portfolio' | 'product' | 'admin';
export type DesignerCodeTab = 'html' | 'css' | 'system' | 'map';

export interface DesignerThemeOption {
  id: DesignerThemeId;
  label: string;
  description: string;
  accent: string;
  background: string;
  foreground: string;
}

export interface DesignerFormState {
  prompt: string;
  themeId: DesignerThemeId;
  targetDevice: DesignerDevice;
  pageType: DesignerPageType;
  brandColors: string;
  fontPreference: string;
  requiredSections: string;
  mood: string;
}

export interface DesignerSkill {
  id: string;
  text: string;
  createdAt: number;
}

export interface DesignerLayerStyle {
  padding: string;
  margin: string;
  position: string;
  width: string;
  minHeight: string;
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  color: string;
  background: string;
  borderRadius: string;
  border: string;
  boxShadow: string;
  gap: string;
  display: string;
  flexDirection: string;
  justifyContent: string;
  alignItems: string;
  gridTemplateColumns: string;
  textAlign: string;
  imageSize: string;
}

export interface DesignerLayer {
  id: string;
  name: string;
  type: 'section' | 'component' | 'button' | 'card' | 'form' | 'image';
  selector: string;
  visible: boolean;
  locked: boolean;
  style: DesignerLayerStyle;
}

export interface GeneratedDesign {
  id: string;
  title: string;
  summary: string;
  selectedTheme: DesignerThemeOption;
  html: string;
  css: string;
  customizationMap: string;
  responsiveNotes: string[];
  accessibilityChecks: string[];
  suggestedImprovements: string[];
  layers: DesignerLayer[];
  createdAt: number;
}

export interface DesignerHistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  design: GeneratedDesign;
}

export interface DesignerBreakpoints {
  desktop: number;
  tablet: number;
  mobile: number;
}
