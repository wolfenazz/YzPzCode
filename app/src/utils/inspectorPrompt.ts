import type { BrowserSelectedElement } from '../types';

/** Build the full "UI edit request" prompt from an inspected element and the
 * user's instruction text. Shared by the inspector send flow and the
 * copy-to-clipboard action so both always produce the same prompt. */
export const formatElementPrompt = (
  element: BrowserSelectedElement,
  prompt: string,
  deviceLabel: string,
  zoomFactor: number,
): string => {
  const attributeEntries = Object.entries(element.attributes)
    .slice(0, 12)
    .map(([key, value]) => `${key}="${value}"`);

  return [
    `UI edit request for the running local app.`,
    '',
    `Selected element context:`,
    `- Page URL: ${element.pageUrl}`,
    `- Page title: ${element.pageTitle || 'Untitled page'}`,
    `- Preview mode: ${deviceLabel} @ ${Math.round(zoomFactor * 100)}% zoom`,
    `- Viewport: ${element.viewport.width} x ${element.viewport.height}`,
    `- Tag: <${element.tagName}>`,
    `- ID: ${element.id || 'none'}`,
    `- Class: ${element.className || 'none'}`,
    `- Selectors: ${element.selectors.join(' | ')}`,
    `- Bounds: x=${element.rect.x}, y=${element.rect.y}, width=${element.rect.width}, height=${element.rect.height}`,
    `- Text content: ${element.textContent || 'none'}`,
    `- Attributes: ${attributeEntries.length > 0 ? attributeEntries.join(', ') : 'none'}`,
    `- HTML snippet: ${element.htmlSnippet}`,
    '',
    `User request:`,
    prompt.trim(),
    '',
    `Please inspect this workspace, identify the component or markup responsible for this exact UI element, apply the requested change, and then explain the edit you made.`,
  ].join('\n');
};