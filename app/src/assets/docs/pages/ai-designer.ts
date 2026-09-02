export const aiDesignerContent = `# AI Designer

The AI Designer is a prompt-based design studio. Describe the interface you want, pick a page type and theme, and the app generates a complete design you can preview, refine, and export as code.

## Creating a Design

The prompt form has:

- **Idea**: A text description of what you want to build
- **Page type**: Landing page, Website page, Dashboard, Mobile app screen, Form flow, Portfolio, Product page, or Admin panel
- **Theme**: 14 visual directions including Terminal Pro, Minimal SaaS, Futuristic Dark, Neon Cyberpunk, Clean Dashboard, Glassmorphism, Luxury Editorial, Apple-inspired, Material Design, Brutalist, Mobile-first, Developer Portfolio, Enterprise Admin, and Soft Gradient
- **Device**: Responsive, Desktop, Tablet, or Mobile
- **Required sections and mood**: Optional fields to steer the result

Starter chips (Prototype, Slide deck, From Figma, From template, and more) prefill the form with example prompts.

## Refining with the Inspector

After generation, the live preview opens with:

- **Responsive preview controls**: Switch between Responsive, Desktop, Tablet, and Mobile
- **Element inspector**: Browse the generated design as layers. Rename, hide or show, duplicate, and delete elements
- **Customization panel**: Edit CSS properties directly, including display, direction, justify, align, padding, margin, and font family, size, and weight

## Design History

Every iteration is recorded. The **Design history** panel lists past versions so you can undo to a previous design at any time and compare iterations.

## Exporting Code

The **Generated code panel** shows the output with **HTML / CSS / Map / Prompt** tabs and a **Copy active code** button.

Use **Save to Design** to export the files to your workspace's \`Design\` folder:

- \`index.html\`
- \`styles.css\`
- \`designer-meta.json\` (generation metadata)

## Design Skills

Design skills are persistent preference lines that influence future generations, for example "Always use dark mode." Add them in the **Design skills** manager, where example chips show the format.

## Dispatching to Agents

An agent selector (Codex, Claude, Gemini, and others) lets you send the generated design to an agent session for further implementation work in your actual project.

> **Tip:** Combine the AI Designer with the browser's Copy UI mode: capture a component you like from any webpage, then use it as the reference for your next design generation.
`;
