import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormattedResponse } from './FormattedResponse';
import { CodeBlock } from './CodeBlock';

describe('formatted assistant responses', () => {
  it('renders semantic Markdown, a GFM table and coloured code without fence punctuation', () => {
    const { container } = render(
      <FormattedResponse
        text={
          '## Your agent\n\nUse **instructions** and `generate()`.\n\n1. Register it\n2. Run it\n\n| Mode | Cost |\n| --- | --- |\n| Offline | Free |\n\n```ts\nconst ready: boolean = true;\n```'
        }
      />,
    );
    expect(screen.getByRole('heading', { name: 'Your agent' })).toBeVisible();
    expect(container.querySelector('strong')).toHaveTextContent('instructions');
    expect(screen.getByRole('list')).toHaveTextContent('Register it');
    expect(screen.getByRole('table')).toHaveTextContent('Offline');
    const code = screen.getByLabelText('ts code');
    expect(code.querySelector('.token.keyword')).toHaveTextContent('const');
    expect(code.textContent).not.toContain('```');
    expect(container.querySelector('pre > code')).not.toBeNull();
    expect(container.querySelector('pre div')).toBeNull();
  });

  it('never loads model images, interprets HTML or exposes dangerous link targets', () => {
    const { container } = render(
      <FormattedResponse
        text={
          '<script>alert(1)</script>\n\n<img src="https://evil.example/pixel" onerror="alert(1)">\n\n[bad](javascript:alert%281%29) [data](data:text/html,hello) [file](file:///secret) [remote](//evil.example) [good](https://mastra.ai/docs)\n\n![Diagram](https://evil.example/tracker.png)'
        }
      />,
    );
    expect(container.querySelector('script, img, iframe')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'good' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('[Image: Diagram]')).toBeVisible();
  });

  it('keeps incomplete streaming fences readable and updates when complete', () => {
    const { rerender } = render(<FormattedResponse text={'```python\ndef answer():'} />);
    expect(screen.getByLabelText('python code').querySelector('.token.keyword')).toHaveTextContent('def');
    rerender(<FormattedResponse text={'```python\ndef answer():\n    return 42\n```\n\n**Done**'} />);
    expect(screen.getByLabelText('python code')).toHaveTextContent('return 42');
    expect(screen.getByText('Done').tagName).toBe('STRONG');
  });

  it.each([
    ['json', '{"ok": true}', 'boolean'],
    ['bash', 'echo "hello"', 'string'],
    ['yaml', 'name: agent', 'key'],
  ])('highlights %s using its own grammar', (language, code, token) => {
    const { container } = render(<CodeBlock language={language} code={code} label="Example code" />);
    expect(container.querySelector(`.token.${token}`)).not.toBeNull();
  });

  it('uses plain text for unknown languages and preserves very large code and responses', () => {
    const { container, rerender } = render(
      <CodeBlock code={'<script>const danger = true;</script>'} language="invented" label="Code" />,
    );
    expect(container.querySelector('.token.keyword, script')).toBeNull();
    const code = 'const abc = true;\n'.repeat(3000);
    rerender(<CodeBlock code={code} language="typescript" label="Code" />);
    expect(screen.getByLabelText('Code').textContent).toBe(code);
    expect(container.querySelector('.token.keyword')).toBeNull();
    const large = '**raw** '.repeat(13_000);
    rerender(<FormattedResponse text={large} />);
    expect(container.querySelector('.response-literal')?.textContent).toBe(large);
  });

  it('copies original code without line numbers and reports clipboard failure', async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const code = 'const a = 1;\nconst b = 2;\n';
    render(<FormattedResponse text={`\`\`\`typescript\n${code}\`\`\``} />);
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(copy).toHaveBeenCalledWith(code);
    expect(screen.getByRole('status')).toHaveTextContent('Code copied');
    copy.mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(screen.getByRole('status')).toHaveTextContent('Copy unavailable');
    copy.mockRestore();
  });
});
