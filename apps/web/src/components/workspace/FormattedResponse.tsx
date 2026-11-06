import { Children, isValidElement, useId, type ReactNode } from 'react';
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import './formatted-response.css';

function safeUrl(url: string): string {
  const safe = defaultUrlTransform(url);
  // No protocol-relative navigation or hidden whitespace in a scheme.
  if (/^\s*\/\//.test(safe) || [...(safe.split(':')[0] ?? '')].some((char) => char.charCodeAt(0) <= 32)) return '';
  return /^(?:https?:|mailto:|[^:]*$)/i.test(safe) ? safe : '';
}

function Fence({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return null;
  const language = /language-([\w-]+)/.exec(child.props.className ?? '')?.[1] ?? 'text';
  const code = String(child.props.children ?? '');
  return <CodeBlock code={code} language={language} label={`${language} code`} copyable />;
}

const components: Components = {
  pre: Fence,
  code: ({ children }) => <code className="response-inline-code">{children}</code>,
  // A reply is part of a lesson section; model headings must not introduce another page h1.
  h1: ({ children }) => <h3 className="response-heading-major">{children}</h3>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h3>{children}</h3>,
  h4: ({ children }) => <h4>{children}</h4>,
  h5: ({ children }) => <h4>{children}</h4>,
  h6: ({ children }) => <h4>{children}</h4>,
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt }) => <span className="response-image-description">[Image: {alt || 'description unavailable'}]</span>,
  table: ({ children }) => (
    <div className="response-table" role="region" aria-label="Response table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
};

/** Untrusted assistant Markdown. Never enable raw HTML or load model-supplied images. */
export function FormattedResponse({ text }: { text: string }) {
  const id = useId();
  return (
    <div className="formatted-response">
      {text.length > 100_000 ? (
        <>
          <p className="text-xs text-fg-muted">Large response shown as plain text to keep the page responsive.</p>
          <div className="response-literal">{text}</div>
        </>
      ) : (
        <Markdown
          skipHtml
          remarkPlugins={[remarkGfm]}
          components={components}
          urlTransform={safeUrl}
          remarkRehypeOptions={{ clobberPrefix: `response-${id}-` }}
        >
          {text}
        </Markdown>
      )}
    </div>
  );
}
