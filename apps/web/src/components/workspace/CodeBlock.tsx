import { Highlight, themes, type PrismTheme } from 'prism-react-renderer';

/** oneDark with comment colour raised to meet WCAG AA (4.5:1) on its #282c34 background. */
const ACCESSIBLE_ONE_DARK: PrismTheme = {
  ...themes.oneDark,
  styles: [
    ...themes.oneDark.styles,
    { types: ['comment', 'prolog', 'cdata'], style: { color: '#a0a8b7', fontStyle: 'italic' } },
  ],
};

const PRISM_LANG: Record<string, string> = { typescript: 'tsx', tsx: 'tsx', json: 'json', markdown: 'markdown' };

/** Readonly syntax-highlighted code with line numbers (dark surface in both app themes). */
export function CodeBlock({ code, language, label }: { code: string; language: string; label: string }) {
  return (
    <Highlight code={code.replace(/\n$/, '')} language={PRISM_LANG[language] ?? 'tsx'} theme={ACCESSIBLE_ONE_DARK}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          tabIndex={0}
          aria-label={label}
          className={`${className} max-h-[32rem] overflow-auto rounded-lg p-4 font-mono text-xs leading-5`}
          style={style}
        >
          {tokens.map((line, i) => {
            const { key: _lineKey, ...lineProps } = getLineProps({ line, key: i });
            return (
              <div key={i} {...lineProps}>
                <span aria-hidden="true" className="mr-4 inline-block w-8 text-right text-[#a0a8b7] select-none">
                  {i + 1}
                </span>
                {line.map((token, j) => {
                  const { key: _tokenKey, ...tokenProps } = getTokenProps({ token, key: j });
                  return <span key={j} {...tokenProps} />;
                })}
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}
