import type {
  DesignerBreakpoints,
  DesignerFormState,
  DesignerLayer,
  DesignerLayerStyle,
  DesignerPageType,
  DesignerSkill,
  DesignerThemeId,
  DesignerThemeOption,
  GeneratedDesign,
} from './types';

export const DESIGNER_SYSTEM_PROMPT = `You are Designer, an AI-powered UI/UX design and frontend generation agent.

Your role is to help users transform rough ideas into polished, responsive website pages and mobile app screens using clean HTML and CSS.

You behave like a senior product designer, UI/UX expert, and frontend developer. You care deeply about usability, visual hierarchy, accessibility, responsive behavior, and clean implementation.

Before generating a design, ask the user for the most important missing details, especially:

- What they want to design
- Preferred design theme
- Target platform: desktop, mobile, tablet, or responsive
- Brand colors or style preferences
- Required sections or components
- Any user-defined skills or design rules they want applied

When the user is unsure, suggest suitable options instead of blocking progress.

Always offer theme choices such as Terminal Pro, Minimal SaaS, Futuristic Dark, Neon Cyberpunk, Clean Dashboard, Glassmorphism, Luxury Editorial, Apple-inspired, Material Design, Brutalist, Mobile-first, Developer Portfolio, Enterprise Admin, and Soft Gradient.

When generating designs:

- Use semantic HTML.
- Use modern CSS.
- Keep the code clean, modular, and easy to edit.
- Use responsive layouts.
- Support desktop, tablet, and mobile breakpoints.
- Use accessible color contrast.
- Use meaningful class names.
- Use consistent spacing, typography, and component styling.
- Avoid inline styles unless necessary.
- Avoid unnecessary dependencies.
- Generate HTML and CSS that can be exported or edited easily.
- Structure elements so each section and component can be customized later.

After generating a design, provide editable controls for major elements, including layout, spacing, padding, margin, position, typography, colors, border radius, borders, shadows, width, height, alignment, buttons, cards, forms, images, icons, and responsive behavior.

Support user skills and persistent design preferences. If the user adds a skill, apply it to future designs unless they override it.

Your default visual identity should align with the app's terminal-inspired aesthetic: dark backgrounds, clean monospace accents, subtle green highlights, command-line inspired UI details, and polished developer-focused interactions. However, always adapt to the user's chosen theme.

Your final output should include a short design summary, the selected design theme, generated HTML, generated CSS, editable customization map, responsive behavior notes, and suggested next improvements.`;

export const DESIGNER_THEMES: DesignerThemeOption[] = [
  {
    id: 'terminal-pro',
    label: 'Terminal Pro',
    description: 'Developer-focused dark UI with command-line texture and green accents.',
    accent: '#22c55e',
    background: '#07090a',
    foreground: '#ecfdf5',
  },
  {
    id: 'minimal-saas',
    label: 'Minimal SaaS',
    description: 'Quiet product UI with strong whitespace, calm borders, and readable type.',
    accent: '#38bdf8',
    background: '#f8fafc',
    foreground: '#0f172a',
  },
  {
    id: 'futuristic-dark',
    label: 'Futuristic Dark',
    description: 'Dim graphite surfaces with cyan telemetry and precise modular panels.',
    accent: '#06b6d4',
    background: '#080b12',
    foreground: '#e2f7ff',
  },
  {
    id: 'neon-cyberpunk',
    label: 'Neon Cyberpunk',
    description: 'High contrast night mode with electric magenta, cyan, and sharp edges.',
    accent: '#f0abfc',
    background: '#0b0610',
    foreground: '#fff1ff',
  },
  {
    id: 'clean-dashboard',
    label: 'Clean Dashboard',
    description: 'Dense operational layout with metrics, tables, and compact controls.',
    accent: '#60a5fa',
    background: '#101318',
    foreground: '#f8fafc',
  },
  {
    id: 'glassmorphism',
    label: 'Glassmorphism',
    description: 'Layered translucent panels with restrained blur and luminous borders.',
    accent: '#67e8f9',
    background: '#07111f',
    foreground: '#f0fdfa',
  },
  {
    id: 'luxury-editorial',
    label: 'Luxury Editorial',
    description: 'Elegant product storytelling with serif-inspired rhythm and deep contrast.',
    accent: '#d6b16a',
    background: '#10100f',
    foreground: '#fff8ed',
  },
  {
    id: 'apple-inspired',
    label: 'Apple-inspired',
    description: 'Refined product page with soft neutrals, big hierarchy, and crisp cards.',
    accent: '#0ea5e9',
    background: '#f5f7fb',
    foreground: '#111827',
  },
  {
    id: 'material-design',
    label: 'Material Design',
    description: 'Structured surfaces, visible states, clear hierarchy, and familiar controls.',
    accent: '#4f46e5',
    background: '#111827',
    foreground: '#f9fafb',
  },
  {
    id: 'brutalist',
    label: 'Brutalist',
    description: 'Raw grid, hard borders, expressive contrast, and direct typography.',
    accent: '#facc15',
    background: '#111111',
    foreground: '#ffffff',
  },
  {
    id: 'mobile-first',
    label: 'Mobile-first',
    description: 'Compact screen design with thumb-friendly spacing and clear states.',
    accent: '#34d399',
    background: '#081016',
    foreground: '#e7fff4',
  },
  {
    id: 'developer-portfolio',
    label: 'Developer Portfolio',
    description: 'Personal showcase with terminal details, project cards, and strong CTAs.',
    accent: '#10b981',
    background: '#080a0d',
    foreground: '#f5f5f5',
  },
  {
    id: 'enterprise-admin',
    label: 'Enterprise Admin',
    description: 'Serious admin surface with navigation, filters, charts, and tables.',
    accent: '#93c5fd',
    background: '#0f141d',
    foreground: '#e5e7eb',
  },
  {
    id: 'soft-gradient',
    label: 'Soft Gradient',
    description: 'Friendly modern page with gentle color transitions and polished cards.',
    accent: '#fb7185',
    background: '#fff7ed',
    foreground: '#1f2937',
  },
];

export const PAGE_TYPE_OPTIONS: Array<{ id: DesignerPageType; label: string }> = [
  { id: 'landing', label: 'Landing page' },
  { id: 'website', label: 'Website page' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'mobile-app', label: 'Mobile app screen' },
  { id: 'form', label: 'Form flow' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'product', label: 'Product page' },
  { id: 'admin', label: 'Admin panel' },
];

export const DEFAULT_BREAKPOINTS: DesignerBreakpoints = {
  desktop: 1280,
  tablet: 834,
  mobile: 390,
};

const DEFAULT_LAYER_STYLE: DesignerLayerStyle = {
  padding: '48px',
  margin: '0',
  position: 'relative',
  width: '100%',
  minHeight: 'auto',
  fontSize: '16px',
  fontWeight: '500',
  fontFamily: 'inherit',
  color: 'inherit',
  background: 'transparent',
  borderRadius: '8px',
  border: '1px solid transparent',
  boxShadow: 'none',
  gap: '24px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  textAlign: 'left',
  imageSize: '100%',
};

const lightThemeIds = new Set<DesignerThemeId>(['minimal-saas', 'apple-inspired', 'soft-gradient']);

const themeById = (themeId: DesignerThemeId): DesignerThemeOption =>
  DESIGNER_THEMES.find((theme) => theme.id === themeId) ?? DESIGNER_THEMES[0];

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'design';

const summarizeIdea = (prompt: string, pageType: DesignerPageType): string => {
  const trimmed = prompt.trim();
  if (trimmed.length > 0) {
    return trimmed.length > 86 ? `${trimmed.slice(0, 83)}...` : trimmed;
  }
  const fallback: Record<DesignerPageType, string> = {
    landing: 'A conversion-ready landing page for a developer product',
    website: 'A polished website page with clear sections and CTAs',
    dashboard: 'A compact analytics dashboard for daily operations',
    'mobile-app': 'A mobile app screen with focused navigation and strong hierarchy',
    form: 'A clean form workflow with validation-ready sections',
    portfolio: 'A developer portfolio with project evidence and contact CTA',
    product: 'A product page with value proof and feature storytelling',
    admin: 'An enterprise admin panel with filters, records, and status signals',
  };
  return fallback[pageType];
};

const getDesignTitle = (form: DesignerFormState): string => {
  const summary = summarizeIdea(form.prompt, form.pageType);
  const firstWords = summary.split(/\s+/).slice(0, 6).join(' ');
  return `${firstWords}${firstWords.length < summary.length ? '' : ''}`;
};

const pickFontStack = (fontPreference: string, themeId: DesignerThemeId): string => {
  const requested = fontPreference.trim();
  if (requested) {
    return `'${requested}', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`;
  }
  if (themeId === 'luxury-editorial') {
    return 'Georgia, "Times New Roman", serif';
  }
  if (lightThemeIds.has(themeId)) {
    return 'Aptos, "Segoe UI", system-ui, sans-serif';
  }
  return '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace';
};

const parseBrandColors = (brandColors: string, theme: DesignerThemeOption): string[] => {
  const colors = brandColors
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(entry));
  return colors.length > 0 ? colors.slice(0, 4) : [theme.accent, '#38bdf8', '#a3e635'];
};

const buildLayers = (form: DesignerFormState, theme: DesignerThemeOption): DesignerLayer[] => {
  const isDashboard = form.pageType === 'dashboard' || form.pageType === 'admin';
  const isMobile = form.pageType === 'mobile-app' || form.targetDevice === 'mobile';
  const cardBackground = lightThemeIds.has(theme.id) ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.045)';
  const sectionBackground = lightThemeIds.has(theme.id) ? 'rgba(255,255,255,0.54)' : 'rgba(10,14,20,0.72)';
  const border = lightThemeIds.has(theme.id) ? '1px solid rgba(15,23,42,0.10)' : '1px solid rgba(255,255,255,0.10)';

  const baseLayer = (
    id: string,
    name: string,
    type: DesignerLayer['type'],
    selector: string,
    style: Partial<DesignerLayerStyle>,
  ): DesignerLayer => ({
    id,
    name,
    type,
    selector,
    visible: true,
    locked: false,
    style: { ...DEFAULT_LAYER_STYLE, ...style },
  });

  return [
    baseLayer('navigation', 'Navigation', 'section', '.nav-shell', {
      padding: '18px 24px',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      border,
      background: sectionBackground,
      borderRadius: '8px',
    }),
    baseLayer('hero', isMobile ? 'App Header' : 'Hero Section', 'section', '.hero', {
      padding: isMobile ? '28px 22px' : '72px 64px',
      minHeight: isMobile ? 'auto' : '520px',
      background: `linear-gradient(135deg, ${theme.background}, rgba(255,255,255,0.04))`,
      border,
      borderRadius: '8px',
      gap: '28px',
    }),
    baseLayer('primary-cta', 'Primary Button', 'button', '.button-primary', {
      padding: '14px 18px',
      width: 'fit-content',
      background: theme.accent,
      color: lightThemeIds.has(theme.id) ? '#061016' : '#041007',
      borderRadius: theme.id === 'brutalist' ? '2px' : '8px',
      border: `1px solid ${theme.accent}`,
      fontWeight: '800',
      boxShadow: `0 16px 34px ${theme.accent}33`,
    }),
    baseLayer('secondary-cta', 'Secondary Button', 'button', '.button-secondary', {
      padding: '14px 18px',
      width: 'fit-content',
      background: 'transparent',
      color: theme.foreground,
      borderRadius: theme.id === 'brutalist' ? '2px' : '8px',
      border,
      fontWeight: '700',
    }),
    baseLayer('feature-grid', isDashboard ? 'Metric Grid' : 'Feature Grid', 'section', '.feature-grid', {
      padding: '0',
      display: 'grid',
      gridTemplateColumns: isDashboard ? 'repeat(4, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
      gap: '16px',
    }),
    baseLayer('feature-card', isDashboard ? 'Metric Cards' : 'Feature Cards', 'card', '.feature-card', {
      padding: '24px',
      background: cardBackground,
      border,
      borderRadius: theme.id === 'brutalist' ? '2px' : '8px',
      boxShadow: lightThemeIds.has(theme.id) ? '0 24px 60px rgba(15,23,42,0.08)' : '0 24px 70px rgba(0,0,0,0.22)',
    }),
    baseLayer('visual-panel', isMobile ? 'Mobile Preview Panel' : 'Visual Panel', 'image', '.visual-panel', {
      padding: '24px',
      minHeight: isMobile ? '420px' : '440px',
      background: cardBackground,
      border,
      borderRadius: '8px',
      imageSize: isMobile ? '320px' : '100%',
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 28px 70px rgba(0,0,0,0.25)`,
    }),
    baseLayer('detail-section', isDashboard ? 'Records Section' : 'Detail Section', 'section', '.detail-section', {
      padding: '34px',
      background: sectionBackground,
      border,
      borderRadius: '8px',
      gap: '18px',
    }),
    baseLayer('form-block', form.pageType === 'form' ? 'Form Block' : 'Capture Form', 'form', '.capture-form', {
      padding: '20px',
      background: cardBackground,
      border,
      borderRadius: '8px',
      gap: '12px',
    }),
  ];
};

const styleRule = (layer: DesignerLayer): string => {
  const { style } = layer;
  return `${layer.selector} {
  display: ${style.display};
  flex-direction: ${style.flexDirection};
  justify-content: ${style.justifyContent};
  align-items: ${style.alignItems};
  gap: ${style.gap};
  position: ${style.position};
  width: ${style.width};
  min-height: ${style.minHeight};
  margin: ${style.margin};
  padding: ${style.padding};
  color: ${style.color};
  background: ${style.background};
  border: ${style.border};
  border-radius: ${style.borderRadius};
  box-shadow: ${style.boxShadow};
  font-family: ${style.fontFamily};
  font-size: ${style.fontSize};
  font-weight: ${style.fontWeight};
  text-align: ${style.textAlign};
}`;
};

const getSections = (requiredSections: string): string[] => {
  const entries = requiredSections
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length > 0) return entries.slice(0, 5);
  return ['Hero', 'Features', 'Social proof', 'Pricing', 'CTA'];
};

const getPageTypeLabel = (pageType: DesignerPageType): string =>
  PAGE_TYPE_OPTIONS.find((option) => option.id === pageType)?.label ?? 'Landing page';

const buildHtml = (form: DesignerFormState, theme: DesignerThemeOption): string => {
  const title = escapeHtml(getDesignTitle(form));
  const idea = escapeHtml(summarizeIdea(form.prompt, form.pageType));
  const mood = escapeHtml(form.mood.trim() || 'confident, polished, and developer-focused');
  const sections = getSections(form.requiredSections);
  const isDashboard = form.pageType === 'dashboard' || form.pageType === 'admin';
  const isMobile = form.pageType === 'mobile-app' || form.targetDevice === 'mobile';
  const statusLabel = isDashboard ? 'System Load' : 'Design Score';
  const primaryMetric = isDashboard ? '98.4%' : '4.9';
  const secondaryMetric = isDashboard ? '12ms' : '24k';

  const featureCards = sections.slice(0, 3).map((section, index) => {
    const label = escapeHtml(section);
    const metric = isDashboard ? `${87 + index * 4}%` : `0${index + 1}`;
    return `<article class="feature-card" data-designer-layer="feature-card">
        <span class="card-kicker">${metric}</span>
        <h3>${label}</h3>
        <p>Purpose-built layout treatment with accessible contrast, responsive spacing, and editable component styling.</p>
      </article>`;
  }).join('\n      ');

  const visualRows = isDashboard
    ? `<div class="chart-strip"><span style="height: 72%"></span><span style="height: 48%"></span><span style="height: 88%"></span><span style="height: 62%"></span><span style="height: 94%"></span><span style="height: 56%"></span></div>
          <div class="data-table">
            <div><span>Queue</span><strong>stable</strong></div>
            <div><span>Latency</span><strong>${secondaryMetric}</strong></div>
            <div><span>Deploys</span><strong>42</strong></div>
          </div>`
    : `<div class="mock-window">
            <div class="mock-dots"><span></span><span></span><span></span></div>
            <div class="mock-line wide"></div>
            <div class="mock-line"></div>
            <div class="mock-grid"><span></span><span></span><span></span><span></span></div>
          </div>`;

  const formBlock = form.pageType === 'form'
    ? `<form class="capture-form" data-designer-layer="form-block">
        <label>
          <span>Project name</span>
          <input type="text" placeholder="Command Center" />
        </label>
        <label>
          <span>Design goal</span>
          <textarea placeholder="Describe the outcome"></textarea>
        </label>
        <button class="button-primary" type="button">Create draft</button>
      </form>`
    : `<form class="capture-form" data-designer-layer="form-block">
        <label>
          <span>Email</span>
          <input type="email" placeholder="founder@company.com" />
        </label>
        <button class="button-primary" type="button">Request preview</button>
      </form>`;

  const mobileShell = isMobile
    ? `<aside class="visual-panel mobile-shell" data-designer-layer="visual-panel" aria-label="Mobile preview">
        <div class="phone-status"><span>9:41</span><span>LTE</span></div>
        <div class="app-card active">
          <span class="card-kicker">Today</span>
          <h3>${title}</h3>
          <p>${idea}</p>
        </div>
        <div class="app-list"><span></span><span></span><span></span></div>
      </aside>`
    : `<aside class="visual-panel" data-designer-layer="visual-panel" aria-label="Generated visual preview">
        ${visualRows}
      </aside>`;

  return `<main class="designer-output ${isMobile ? 'is-mobile-screen' : ''}" data-theme="${theme.id}">
  <nav class="nav-shell" data-designer-layer="navigation" aria-label="Primary navigation">
    <a class="brand" href="#"><span>></span> ${title}</a>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#details">Details</a>
      <a href="#contact">Contact</a>
    </div>
  </nav>

  <section class="hero" data-designer-layer="hero">
    <div class="hero-copy">
      <span class="eyebrow">${getPageTypeLabel(form.pageType)} / ${escapeHtml(theme.label)}</span>
      <h1>${idea}</h1>
      <p>${mood}. Built with modular HTML, editable CSS layers, and responsive breakpoints from the start.</p>
      <div class="button-row">
        <a class="button-primary" data-designer-layer="primary-cta" href="#contact">Generate version</a>
        <a class="button-secondary" data-designer-layer="secondary-cta" href="#features">View sections</a>
      </div>
    </div>
    ${mobileShell}
  </section>

  <section class="feature-grid" id="features" data-designer-layer="feature-grid" aria-label="Key sections">
    ${featureCards}
  </section>

  <section class="detail-section" id="details" data-designer-layer="detail-section">
    <div>
      <span class="eyebrow">Live system</span>
      <h2>Clear hierarchy, reusable sections, and controls for every major layer.</h2>
    </div>
    <div class="detail-grid">
      <div><span>${statusLabel}</span><strong>${primaryMetric}</strong></div>
      <div><span>Breakpoint ready</span><strong>3x</strong></div>
      <div><span>Editable layers</span><strong>9</strong></div>
    </div>
    ${formBlock}
  </section>
</main>`;
};

const buildCss = (
  form: DesignerFormState,
  theme: DesignerThemeOption,
  layers: DesignerLayer[],
  breakpoints: DesignerBreakpoints = DEFAULT_BREAKPOINTS,
): string => {
  const isLight = lightThemeIds.has(theme.id);
  const brandColors = parseBrandColors(form.brandColors, theme);
  const fontStack = pickFontStack(form.fontPreference, theme.id);
  const surface = isLight ? 'rgba(255,255,255,0.76)' : 'rgba(255,255,255,0.055)';
  const textMuted = isLight ? '#475569' : '#9ca3af';
  const border = isLight ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.11)';
  const layerRules = layers.filter((layer) => layer.visible).map(styleRule).join('\n\n');

  return `:root {
  --designer-bg: ${theme.background};
  --designer-fg: ${theme.foreground};
  --designer-muted: ${textMuted};
  --designer-surface: ${surface};
  --designer-border: ${border};
  --designer-accent: ${brandColors[0]};
  --designer-accent-2: ${brandColors[1] ?? theme.accent};
  --designer-accent-3: ${brandColors[2] ?? '#a3e635'};
  --designer-font: ${fontStack};
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  background: var(--designer-bg);
  color: var(--designer-fg);
  font-family: var(--designer-font);
}

a {
  color: inherit;
  text-decoration: none;
}

.designer-output {
  width: 100%;
  min-height: 100vh;
  padding: 22px;
  background:
    radial-gradient(circle at 14% 8%, color-mix(in srgb, var(--designer-accent) 24%, transparent), transparent 28%),
    radial-gradient(circle at 88% 18%, color-mix(in srgb, var(--designer-accent-2) 18%, transparent), transparent 26%),
    linear-gradient(145deg, var(--designer-bg), color-mix(in srgb, var(--designer-bg) 80%, #000 20%));
}

.designer-output.is-mobile-screen {
  max-width: 430px;
  margin: 0 auto;
}

.brand,
.nav-links,
.button-row,
.detail-grid,
.mock-dots,
.data-table > div,
.phone-status {
  display: flex;
  align-items: center;
}

.brand {
  gap: 10px;
  font-weight: 800;
}

.brand span,
.eyebrow,
.card-kicker {
  color: var(--designer-accent);
}

.nav-links {
  gap: 18px;
  color: var(--designer-muted);
  font-size: 13px;
}

.hero {
  margin-top: 18px;
  overflow: hidden;
}

.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(var(--designer-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--designer-border) 1px, transparent 1px);
  background-size: 44px 44px;
  opacity: 0.12;
}

.hero-copy {
  position: relative;
  z-index: 1;
  max-width: 760px;
}

.eyebrow,
.card-kicker {
  display: inline-flex;
  margin-bottom: 14px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  max-width: 860px;
  font-size: clamp(38px, 7vw, 78px);
  line-height: 0.98;
  font-weight: 900;
}

h2 {
  max-width: 760px;
  font-size: clamp(24px, 4vw, 42px);
  line-height: 1.05;
}

h3 {
  font-size: 18px;
  line-height: 1.2;
}

p {
  color: var(--designer-muted);
  line-height: 1.75;
}

.hero-copy > p {
  max-width: 660px;
  margin-top: 22px;
  font-size: 16px;
}

.button-row {
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 30px;
}

.button-primary,
.button-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.button-primary:hover,
.button-secondary:hover {
  transform: translateY(-1px);
}

.feature-grid {
  margin-top: 16px;
}

.feature-card {
  min-height: 190px;
}

.feature-card p {
  margin-top: 12px;
  font-size: 13px;
}

.visual-panel {
  position: relative;
  z-index: 1;
  margin-top: 34px;
  overflow: hidden;
}

.mock-window {
  min-height: 360px;
  border: 1px solid var(--designer-border);
  border-radius: 8px;
  padding: 18px;
  background: rgba(0,0,0,0.22);
}

.mock-dots {
  gap: 7px;
  margin-bottom: 28px;
}

.mock-dots span {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--designer-accent);
}

.mock-line {
  height: 13px;
  width: 62%;
  margin-bottom: 14px;
  border-radius: 999px;
  background: var(--designer-surface);
}

.mock-line.wide {
  width: 84%;
}

.mock-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 34px;
}

.mock-grid span {
  min-height: 104px;
  border: 1px solid var(--designer-border);
  border-radius: 8px;
  background: linear-gradient(135deg, var(--designer-surface), transparent);
}

.chart-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  align-items: end;
  gap: 12px;
  min-height: 270px;
}

.chart-strip span {
  border-radius: 8px 8px 2px 2px;
  background: linear-gradient(180deg, var(--designer-accent), color-mix(in srgb, var(--designer-accent-2) 60%, transparent));
}

.data-table {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}

.data-table > div,
.detail-grid > div {
  justify-content: space-between;
  border: 1px solid var(--designer-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--designer-surface);
}

.detail-section {
  margin-top: 16px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.detail-grid span,
.data-table span,
.capture-form span {
  color: var(--designer-muted);
  font-size: 12px;
}

.detail-grid strong,
.data-table strong {
  font-size: 22px;
}

.capture-form {
  margin-top: 8px;
}

.capture-form label {
  display: grid;
  gap: 7px;
}

.capture-form input,
.capture-form textarea {
  width: 100%;
  border: 1px solid var(--designer-border);
  border-radius: 8px;
  padding: 13px 14px;
  background: rgba(0,0,0,0.16);
  color: var(--designer-fg);
  font: inherit;
}

.capture-form textarea {
  min-height: 96px;
  resize: vertical;
}

.mobile-shell {
  display: grid;
  gap: 16px;
}

.phone-status {
  justify-content: space-between;
  color: var(--designer-muted);
  font-size: 12px;
}

.app-card {
  border: 1px solid var(--designer-border);
  border-radius: 8px;
  padding: 22px;
  background: linear-gradient(135deg, var(--designer-surface), rgba(255,255,255,0.02));
}

.app-list {
  display: grid;
  gap: 10px;
}

.app-list span {
  height: 52px;
  border: 1px solid var(--designer-border);
  border-radius: 8px;
  background: var(--designer-surface);
}

${layerRules}

@media (max-width: ${breakpoints.tablet}px) {
  .designer-output {
    padding: 16px;
  }

  .nav-shell,
  .hero {
    padding: 22px;
  }

  .nav-links {
    display: none;
  }

  .feature-grid,
  .detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: ${breakpoints.mobile}px) {
  .designer-output {
    padding: 12px;
  }

  .feature-grid,
  .detail-grid,
  .mock-grid {
    grid-template-columns: 1fr;
  }

  .hero,
  .detail-section,
  .feature-card {
    padding: 22px;
  }

  .button-primary,
  .button-secondary {
    width: 100%;
  }
}`;
};

const buildCustomizationMap = (layers: DesignerLayer[]): string =>
  JSON.stringify(
    layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      type: layer.type,
      selector: layer.selector,
      editableControls: [
        'padding',
        'margin',
        'position',
        'width',
        'minHeight',
        'fontSize',
        'fontWeight',
        'fontFamily',
        'color',
        'background',
        'borderRadius',
        'border',
        'boxShadow',
        'gap',
        'alignment',
        'gridTemplateColumns',
        'imageSize',
      ],
      style: layer.style,
    })),
    null,
    2,
  );

export const createInitialDesignerForm = (): DesignerFormState => ({
  prompt: 'A polished launch page for a developer automation product with a hero, feature cards, proof metrics, and a compact lead form.',
  themeId: 'terminal-pro',
  targetDevice: 'responsive',
  pageType: 'landing',
  brandColors: '',
  fontPreference: '',
  requiredSections: 'Hero, Features, Proof metrics, Lead form, Final CTA',
  mood: 'precise, confident, fast, and terminal-inspired',
});

export const createDefaultDesignerSkills = (): DesignerSkill[] => [
  {
    id: 'skill-dark-terminal',
    text: 'Prefer terminal-inspired dark themes with subtle green highlights.',
    createdAt: 1,
  },
  {
    id: 'skill-accessible',
    text: 'Keep layouts readable, spacious, and accessible on mobile screens.',
    createdAt: 2,
  },
];

export const generateDesign = (
  form: DesignerFormState,
  skills: DesignerSkill[],
  generationNumber: number,
  layersOverride?: DesignerLayer[],
  breakpoints: DesignerBreakpoints = DEFAULT_BREAKPOINTS,
): GeneratedDesign => {
  const theme = themeById(form.themeId);
  const layers = layersOverride ?? buildLayers(form, theme);
  const skillSummary = skills.map((skill) => skill.text).join(' ');
  const title = getDesignTitle(form);
  const html = buildHtml(form, theme);
  const css = buildCss(form, theme, layers, breakpoints);
  const summary = `${summarizeIdea(form.prompt, form.pageType)} Generated with ${theme.label} styling${skillSummary ? ` and ${skills.length} saved design skill${skills.length === 1 ? '' : 's'}` : ''}.`;

  return {
    id: `${slugify(title)}-${Date.now()}-${generationNumber}`,
    title,
    summary,
    selectedTheme: theme,
    html,
    css,
    customizationMap: buildCustomizationMap(layers),
    responsiveNotes: [
      `Desktop preview targets ${breakpoints.desktop}px wide compositions with multi-column sections.`,
      `Tablet breakpoint collapses navigation and shifts dense grids below ${breakpoints.tablet}px.`,
      `Mobile breakpoint stacks cards, stretches CTA buttons, and reduces section padding below ${breakpoints.mobile}px.`,
    ],
    accessibilityChecks: [
      'Semantic landmarks and section labels are included.',
      'Interactive controls use visible focus-ready button and input states.',
      'Color choices are generated from high contrast foreground/background pairs.',
      'Inputs include labels and meaningful placeholder text.',
    ],
    suggestedImprovements: [
      'Replace placeholder copy with product-specific benefits.',
      'Add real customer proof or dashboard data once available.',
      'Regenerate a selected section after brand direction is finalized.',
      'Export HTML/CSS and wire it into the target framework component tree.',
    ],
    layers,
    createdAt: Date.now(),
  };
};

export const regenerateLayer = (design: GeneratedDesign, layerId: string): GeneratedDesign => {
  const targetLayer = design.layers.find((layer) => layer.id === layerId);
  if (!targetLayer) return design;

  const layers = design.layers.map((layer) => {
    if (layer.id !== layerId) return layer;
    const accentBorder = `1px solid ${design.selectedTheme.accent}`;
    return {
      ...layer,
      name: `${layer.name} v2`,
      style: {
        ...layer.style,
        border: accentBorder,
        boxShadow: `0 20px 50px ${design.selectedTheme.accent}22`,
        gap: layer.style.gap === '24px' ? '18px' : '24px',
      },
    };
  });

  return {
    ...design,
    layers,
    css: buildCss(
      {
        ...createInitialDesignerForm(),
        themeId: design.selectedTheme.id,
      },
      design.selectedTheme,
      layers,
    ),
    customizationMap: buildCustomizationMap(layers),
  };
};

export const refreshDesignCode = (
  design: GeneratedDesign,
  form: DesignerFormState,
  breakpoints: DesignerBreakpoints,
): GeneratedDesign => ({
  ...design,
  html: buildHtml(form, design.selectedTheme),
  css: buildCss(form, design.selectedTheme, design.layers, breakpoints),
  customizationMap: buildCustomizationMap(design.layers),
});
