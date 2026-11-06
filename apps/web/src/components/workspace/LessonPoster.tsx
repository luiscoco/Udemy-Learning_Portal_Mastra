import { useId, type Ref } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import type { LabDefinition } from '@mlp/contracts';
import { CONCEPT_FLOWS, walkthroughPhases, type TeachingExcerpt } from '../../features/visual-guides/content';
import { codeLanguage, Prism } from './code-languages';

export const POSTER_WIDTH = 1920;
export const POSTER_HEIGHT = 1080;
const INK = '#101b46';
const BLUE = '#075dcc';
const palettes = ['mint', 'blue', 'violet', 'mint'];
const POSTER_THEME = {
  ...themes.oneDark,
  styles: [
    ...themes.oneDark.styles,
    { types: ['comment', 'prolog', 'cdata'], style: { color: '#a8b8ca' } },
    { types: ['property', 'tag', 'deleted'], style: { color: '#f28b91' } },
  ],
};

export function posterLines(text: string, width: number, maximum: number): string[] {
  const words = text.replace(/[`*#]/g, '').replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  for (const original of words) {
    const parts = original.match(new RegExp(`.{1,${width}}`, 'gu')) ?? [''];
    for (const word of parts) {
      if (current && current.length + word.length + 1 > width) {
        lines.push(current);
        current = '';
      }
      current += (current ? ' ' : '') + word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maximum) return [...lines.slice(0, maximum - 1), `${lines[maximum - 1]!.slice(0, -1)}…`];
  return lines;
}

function Words({
  text,
  x,
  y,
  width = 60,
  max = 3,
  size = 24,
  fill = '#314966',
  weight = 400,
}: {
  text: string;
  x: number;
  y: number;
  width?: number;
  max?: number;
  size?: number;
  fill?: string;
  weight?: number;
}) {
  return (
    <text x={x} y={y} fill={fill} fontSize={size} fontWeight={weight}>
      {posterLines(text, width, max).map((line, i) => (
        <tspan key={i} x={x} dy={i ? size * 1.25 : 0}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function Robot({ prefix }: { prefix: string }) {
  return (
    <g transform="translate(1690 20)" aria-hidden="true">
      <ellipse cx="102" cy="134" rx="100" ry="25" fill="#d8f3ff" />
      <path d="M60 97 Q35 100 31 72 M147 96 Q176 91 172 60" fill="none" stroke="#3d9ce9" strokeWidth="18" strokeLinecap="round" />
      <ellipse cx="103" cy="103" rx="40" ry="42" fill={`url(#${prefix}-metal)`} stroke="#66baff" strokeWidth="3" />
      <rect x="35" y="15" width="135" height="83" rx="38" fill={`url(#${prefix}-metal)`} stroke="#66baff" strokeWidth="3" />
      <rect x="50" y="30" width="105" height="51" rx="25" fill="#091c44" />
      <ellipse cx="80" cy="53" rx="10" ry="12" fill="#02d5e1" />
      <ellipse cx="125" cy="53" rx="10" ry="12" fill="#02d5e1" />
      <path d="M91 70 Q102 78 114 70" stroke="#02d5e1" strokeWidth="3" fill="none" />
      <path d="M103 15V2" stroke="#4d9ce7" strokeWidth="5" />
      <circle cx="103" cy="2" r="7" fill="#00cfc6" />
      <path d="m93 112 9-5 10 5-10 5z m0 8 9 5 10-5 m-19 8 9 5 10-5" stroke="#079bb1" strokeWidth="4" fill="none" />
      <rect x="0" y="103" width="42" height="37" rx="9" fill="#06beac" />
      <text x="7" y="129" fontSize="23" fill="white" fontFamily="monospace">
        {'</>'}
      </text>
    </g>
  );
}

function Terminal({
  excerpt,
  prefix,
  x,
  y,
  width,
  height,
}: {
  excerpt: TeachingExcerpt | null;
  prefix: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const code = excerpt?.code ?? '// Checked reference excerpt is loading.\n// Full teaching text is available below.';
  return (
    <g>
      <rect
        x={x - 6}
        y={y - 6}
        width={width + 12}
        height={height + 12}
        rx="24"
        fill={`url(#${prefix}-metal)`}
        stroke="#64a8e7"
        strokeWidth="2"
      />
      <rect x={x} y={y} width={width} height={height} rx="20" fill="#16283e" />
      <path
        d={`M${x + 20} ${y}H${x + width - 20}Q${x + width} ${y} ${x + width} ${y + 20}V${y + 46}H${x}V${y + 20}Q${x} ${y} ${x + 20} ${y}`}
        fill="#31536e"
      />
      {['#ff7878', '#ffda55', '#4be595'].map((color, i) => (
        <circle key={color} cx={x + 25 + i * 27} cy={y + 23} r="8" fill={color} />
      ))}
      <text x={x + 122} y={y + 31} fontSize="22" fill="#fff" fontWeight="600">
        Teaching excerpt · setup omitted
      </text>
      <Highlight prism={Prism} code={code} language={codeLanguage(excerpt?.language ?? 'text')} theme={POSTER_THEME}>
        {({ tokens, getTokenProps }) => {
          const rows: { content: string; color: string }[][] = [];
          const columns = Math.floor((width - 44) / 13.3);
          for (const line of tokens) {
            let row: { content: string; color: string }[] = [];
            let count = 0;
            for (const token of line) {
              const props = getTokenProps({ token });
              let rest = token.content;
              while (rest.length) {
                const content = rest.slice(0, columns - count);
                row.push({ content, color: String(props.style?.color ?? '#e3edf7') });
                rest = rest.slice(content.length);
                count += content.length;
                if (count === columns) {
                  rows.push(row);
                  row = [];
                  count = 0;
                }
              }
            }
            if (row.length || !line.some((t) => t.content)) rows.push(row);
          }
          const count = Math.floor((height - 76) / 27);
          return (
            <g fontFamily="Consolas, monospace" fontSize="22">
              {rows.slice(0, count).map((row, i) => (
                <text key={i} x={x + 22} y={y + 80 + i * 27} xmlSpace="preserve">
                  {row.map((part, j) => (
                    <tspan key={j} fill={part.color}>
                      {part.content}
                    </tspan>
                  ))}
                </text>
              ))}
              {rows.length > count ? (
                <text x={x + width - 330} y={y + height - 9} fill="#c9dbeb" fontSize="16">
                  Complete excerpt in text view below
                </text>
              ) : null}
            </g>
          );
        }}
      </Highlight>
    </g>
  );
}

/** Original self-contained SVG artwork. Text is escaped by React; no external images or embedded HTML. */
export function LessonPoster({
  definition: d,
  kind,
  excerpt,
  selected = 0,
  svgRef,
  focusRect,
}: {
  definition: LabDefinition;
  kind: 'infographic' | 'walkthrough';
  excerpt: TeachingExcerpt | null;
  selected?: number;
  svgRef?: Ref<SVGSVGElement>;
  focusRect?: readonly [number, number, number, number];
}) {
  const prefix = `poster-${useId().replace(/[^\w-]/g, '')}`;
  const flow = CONCEPT_FLOWS[d.number] ?? CONCEPT_FLOWS[0]!;
  const phases = walkthroughPhases(d);
  const title = kind === 'infographic' ? d.title : 'Exercise walkthrough';
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width={POSTER_WIDTH}
      height={POSTER_HEIGHT}
      viewBox={`0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}`}
      role="img"
      aria-labelledby={`${prefix}-title ${prefix}-desc`}
      style={{ width: '100%', height: 'auto', display: 'block', fontFamily: 'Arial, sans-serif' }}
    >
      <title id={`${prefix}-title`}>
        {d.id}: {kind === 'infographic' ? 'Infographic Content' : 'Exercise Walkthrough'} — {d.title}
      </title>
      <desc id={`${prefix}-desc`}>
        Mastra teaching diagram with{' '}
        {kind === 'infographic'
          ? 'four concept stages and checked reference code'
          : 'six practice phases and checked reference code'}
        . Complete accessible text and source provenance are provided below the image. This is teaching material, not execution
        evidence.
      </desc>
      <defs>
        <linearGradient id={`${prefix}-mint`} x2="1" y2="1">
          <stop stopColor="#e5fff2" />
          <stop offset="1" stopColor="#f5fffd" />
        </linearGradient>
        <linearGradient id={`${prefix}-blue`} x2="1" y2="1">
          <stop stopColor="#e6f4ff" />
          <stop offset="1" stopColor="#f5fbff" />
        </linearGradient>
        <linearGradient id={`${prefix}-violet`} x2="1" y2="1">
          <stop stopColor="#f0eaff" />
          <stop offset="1" stopColor="#faf8ff" />
        </linearGradient>
        <linearGradient id={`${prefix}-metal`} x2=".8" y2="1">
          <stop stopColor="#f9ffff" />
          <stop offset=".5" stopColor="#b9e0ff" />
          <stop offset="1" stopColor="#4f9ee5" />
        </linearGradient>
        <marker id={`${prefix}-arrow`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
          <path d="m1 1 7 4-7 4" fill="none" stroke="#3d6584" strokeWidth="2" />
        </marker>
      </defs>
      <rect width="1920" height="1080" fill="#fff" />
      <ellipse cx="135" cy="95" rx="122" ry="77" fill="#eaf7ff" />
      <path
        d="M50 30Q100 12 145 40Q185 14 217 31V146Q180 135 145 165Q100 143 50 150Z"
        fill={`url(#${prefix}-metal)`}
        stroke="#82bbed"
        strokeWidth="3"
      />
      <text x="89" y="66" fontSize="23" fill={BLUE} fontWeight="700">
        LAB
      </text>
      <text x="112" y="126" fontSize="62" fill={INK} fontWeight="800" textAnchor="middle">
        {String(d.number).padStart(2, '0')}
      </text>
      <text x="255" y="45" fill="#0867e7" fontSize="25" fontWeight="700" letterSpacing="5">
        MASTRA AI AGENTS 2026
      </text>
      <Words text={title} x={255} y={104} width={47} max={2} size={51} fill={INK} weight={800} />
      <Words text={kind === 'infographic' ? d.summary : d.title} x={255} y={185} width={105} max={1} size={25} />
      <Robot prefix={prefix} />
      {kind === 'infographic' ? (
        <>
          <rect x="35" y="215" width="1100" height="645" rx="28" fill={`url(#${prefix}-mint)`} />
          <circle cx="87" cy="264" r="31" fill="#03bd85" />
          <text x="65" y="275" fontSize="30" fill="white" fontFamily="monospace">
            {'</>'}
          </text>
          <text x="138" y="274" fontSize="36" fontWeight="800" fill={INK}>
            Understand the concept
          </text>
          <Words text={d.concept} x={65} y={320} width={88} max={3} size={25} />
          <Terminal excerpt={excerpt} prefix={prefix} x={65} y={425} width={1040} height={365} />
          <Words
            text={
              excerpt
                ? `Reference: packages/labs/src/${d.id}/${excerpt.path}:${excerpt.line}`
                : 'Reference source loading · use the readable summary below'
            }
            x={65}
            y={833}
            width={96}
            max={1}
            size={20}
          />
          <rect x="1160" y="215" width="725" height="645" rx="28" fill={`url(#${prefix}-blue)`} />
          <text x="1190" y="270" fontSize="34" fill={INK} fontWeight="800">
            The lesson at a glance
          </text>
          {flow.map((label, i) => (
            <g key={label}>
              <rect
                x="1190"
                y={296 + i * 136}
                width="665"
                height="115"
                rx="20"
                fill={`url(#${prefix}-${palettes[i]})`}
                stroke={i % 2 ? '#aa91ee' : '#42bce1'}
                strokeWidth="2"
              />
              <circle cx="1227" cy={333 + i * 136} r="21" fill={i % 2 ? '#7550cb' : '#007c92'} />
              <text x="1227" y={341 + i * 136} textAnchor="middle" fontSize="22" fill="white" fontWeight="700">
                {i + 1}
              </text>
              <Words text={label} x={1264} y={335 + i * 136} width={34} max={1} size={27} fill={INK} weight={700} />
              <Words text={d.objectives[i % d.objectives.length]!} x={1210} y={374 + i * 136} width={54} max={2} size={21} />
              {i < 3 ? (
                <path d={`M1520 ${413 + i * 136}v17`} stroke="#3d6584" strokeWidth="2" markerEnd={`url(#${prefix}-arrow)`} />
              ) : null}
            </g>
          ))}
          {[
            {
              title: 'Your inputs',
              text: d.inputs
                .map((f) => f.label)
                .slice(0, 4)
                .join(' · '),
            },
            { title: 'Expected evidence', text: d.expectedOutput.description },
            {
              title: 'Keep the server boundary',
              text: 'React + typed client → Express / Zod → server-only Mastra. Provider keys stay on the server.',
            },
          ].map((item, i) => (
            <g key={item.title}>
              <rect x={35 + i * 625} y="887" width="600" height="130" rx="22" fill={`url(#${prefix}-${palettes[i]})`} />
              <text x={58 + i * 625} y="923" fontSize="26" fontWeight="700" fill={INK}>
                {item.title}
              </text>
              <Words text={item.text} x={58 + i * 625} y={958} width={48} max={2} size={21} />
            </g>
          ))}
        </>
      ) : (
        <>
          {phases.map((phase, i) => {
            const x = 35 + (i % 3) * 625;
            const y = 215 + Math.floor(i / 3) * 213;
            return (
              <g key={phase.title}>
                <rect
                  x={x}
                  y={y}
                  width="600"
                  height="190"
                  rx="24"
                  fill={`url(#${prefix}-${palettes[i % 4]})`}
                  stroke={selected === i ? '#1765c4' : '#bdddec'}
                  strokeWidth={selected === i ? 4 : 1}
                />
                <circle cx={x + 40} cy={y + 43} r="25" fill={i % 2 ? '#7550cb' : '#007c92'} />
                <text x={x + 40} y={y + 52} textAnchor="middle" fontSize="24" fontWeight="700" fill="white">
                  {i + 1}
                </text>
                <Words text={phase.title} x={x + 82} y={y + 51} width={28} max={1} size={29} fill={INK} weight={800} />
                <Words text={phase.summary} x={x + 24} y={y + 96} width={46} max={3} size={23} />
              </g>
            );
          })}
          <Terminal excerpt={excerpt} prefix={prefix} x={42} y={666} width={1085} height={318} />
          <rect x="1160" y="655" width="725" height="343" rx="25" fill={`url(#${prefix}-mint)`} />
          <text x="1190" y="706" fontSize="30" fill={INK} fontWeight="800">
            Inspect, change, explain
          </text>
          <Words
            text={d.checks
              .map((c) => c.label)
              .slice(0, 2)
              .join(' · ')}
            x={1190}
            y={749}
            width={53}
            max={3}
            size={23}
          />
          <Words text={d.guide.challenge.prompt} x={1190} y={857} width={55} max={3} size={22} />
          <Words
            text={
              excerpt ? `${excerpt.path}:${excerpt.line} · setup omitted; read the full source` : 'Checked source excerpt loading'
            }
            x={45}
            y={1017}
            width={96}
            max={1}
            size={18}
          />
        </>
      )}
      {focusRect ? (
        <rect
          data-tour-focus="true"
          x={focusRect[0]}
          y={focusRect[1]}
          width={focusRect[2]}
          height={focusRect[3]}
          fill="none"
          stroke="#d52222"
          strokeWidth="8"
          rx="16"
          aria-hidden="true"
        />
      ) : null}
      <path d="M240 1048H1625" stroke="#94b2cd" strokeWidth="2" />
      {(kind === 'infographic' ? flow : phases).map((_, i) => (
        <circle
          key={i}
          cx={49 + i * 30}
          cy="1048"
          r="10"
          fill={kind === 'walkthrough' && i === selected ? '#0072ee' : '#d8efff'}
        />
      ))}
      <text x="1650" y="1056" fill={INK} fontSize="20">
        {d.id} · {kind === 'infographic' ? 'Concept map' : `${selected + 1} / 6`}
      </text>
      <text x="250" y="1073" fill="#43617c" fontSize="16">
        Teaching illustration · not an execution trace · offline viewing is free · no code runs from this image
      </text>
    </svg>
  );
}
