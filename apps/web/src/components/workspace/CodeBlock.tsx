import { Highlight, themes, type PrismTheme } from 'prism-react-renderer';
import { useState } from 'react';
import { copyText } from '../../lib/download';
import { codeLanguage, Prism } from './code-languages';
import './formatted-response.css';

/** oneDark with comment colour raised to meet WCAG AA (4.5:1) on its #282c34 background. */
const ACCESSIBLE_ONE_DARK: PrismTheme = {
  ...themes.oneDark,
  styles: [
    ...themes.oneDark.styles,
    { types: ['comment', 'prolog', 'cdata'], style: { color: '#a0a8b7', fontStyle: 'italic' } },
    { types: ['property', 'tag', 'deleted'], style: { color: '#f28b91' } },
  ],
};

/** Readonly syntax-highlighted code with line numbers (dark surface in both app themes). */
export function CodeBlock({
  code,
  language,
  label,
  copyable = false,
  lineNumbers = true,
}: {
  code: string;
  language: string;
  label: string;
  copyable?: boolean;
  lineNumbers?: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  const normalized = codeLanguage(language);
  const highlight = code.length <= 40_000 && code.split('\n', 1002).length <= 1000;
  return (
    <div className="code-frame">
      {copyable ? (
        <div className="code-toolbar">
          <span>{normalized === 'plain' ? 'Plain text' : language.toLowerCase()}</span>
          <span role="status" className="code-copy-status">
            {copyStatus}
          </span>
          <button
            type="button"
            onClick={() => {
              void copyText(code).then((ok) => setCopyStatus(ok ? 'Code copied' : 'Copy unavailable — select the code to copy'));
            }}
          >
            Copy code
          </button>
        </div>
      ) : null}
      <Highlight
        prism={Prism}
        code={highlight ? code.replace(/\n$/, '') : ''}
        language={highlight ? normalized : 'plain'}
        theme={ACCESSIBLE_ONE_DARK}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            tabIndex={0}
            aria-label={label}
            className={`${className} max-h-[32rem] max-w-full overflow-auto rounded-lg p-4 font-mono text-xs leading-5`}
            style={style}
          >
            <code>
              {!highlight
                ? code
                : tokens.map((line, i) => {
                    const { key: _lineKey, ...lineProps } = getLineProps({ line, key: i });
                    return (
                      <span key={i} {...lineProps}>
                        {lineNumbers ? (
                          <span aria-hidden="true" className="mr-4 inline-block w-8 text-right text-[#a0a8b7] select-none">
                            {i + 1}
                          </span>
                        ) : null}
                        {line.map((token, j) => {
                          const { key: _tokenKey, ...tokenProps } = getTokenProps({ token, key: j });
                          return <span key={j} {...tokenProps} />;
                        })}
                        {i < tokens.length - 1 ? '\n' : ''}
                      </span>
                    );
                  })}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  );
}
