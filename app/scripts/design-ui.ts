// Renders the composer UI as one bundle so React's hooks share a single copy
// (`npm run test:design`). Entry only: everything is bundled together on purpose.
export { renderToString } from 'react-dom/server.browser';
export { default as React } from 'react';
export { BoardSizePicker } from '../src/components/design/BoardSizePicker';
export { DesignPromptBar } from '../src/components/design/DesignPromptBar';
