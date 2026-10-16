import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openUrl } from '@tauri-apps/plugin-opener';
import { splitFrontmatter } from '../../utils/skillPreview';
import './SkillsMarket.css';

/**
 * Renders a SKILL.md from the catalogue.
 *
 * The YAML frontmatter is promoted to a lead line plus chips instead of being
 * dumped into the preview as text, and the body is rendered as markdown with
 * relative links inert (only http(s) opens in the browser).
 */
export function SkillMarkdownPreview({ text }: { text: string }): React.JSX.Element {
  const { meta, description, body } = useMemo(() => splitFrontmatter(text), [text]);
  return (
    <div className="sk-md">
      {description && <p className="sk-md__lead">{description}</p>}
      {meta.length > 0 && (
        <dl className="sk-md__meta">
          {meta.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                if (href && /^https?:/i.test(href)) void openUrl(href);
              }}
            >
              {children}
            </a>
          ),
          img: () => null,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
