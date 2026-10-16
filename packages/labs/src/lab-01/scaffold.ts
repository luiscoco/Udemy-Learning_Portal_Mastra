import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export interface ScaffoldOptions {
  projectName: string;
  agentName: string;
  modelId: string;
  apiKeyEnvVar: string;
  moduleType: 'module' | 'commonjs';
}

export interface ScaffoldFile {
  path: string;
  content: string;
  role: string;
}

/** What each generated root/entry file is for (shown to learners). */
export const FILE_ROLES: Record<string, string> = {
  'package.json': 'Project manifest: ESM "type", Node engine, mastra CLI scripts and pinned dependencies.',
  'tsconfig.json': 'TypeScript compiler settings (ES2022 modules, bundler resolution, strict mode).',
  '.env.example': 'Names of required secrets. Copy to .env locally; never commit real keys.',
  '.gitignore': 'Keeps node_modules, build output and .env files out of git.',
  'src/mastra/index.ts': 'Entry point: exports the Mastra instance that registers agents (used by mastra dev/build).',
};

export function agentRole(file: string): string {
  return `Agent definition (${file.split('/').pop()}): id, name, instructions and model.`;
}

/** "Support Desk" → { camel: "supportDeskAgent", kebab: "support-desk-agent" } */
export function agentIdentifiers(agentName: string) {
  const words = agentName
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase());
  const camel = words.map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join('') + 'Agent';
  const kebab = `${words.join('-')}-agent`;
  return { camel, kebab };
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
}

/** Reads the reference template and substitutes the learner's choices. Pure apart from reading the template. */
export async function renderScaffold(templateDir: string, opts: ScaffoldOptions): Promise<ScaffoldFile[]> {
  const ids = agentIdentifiers(opts.agentName);
  const files: ScaffoldFile[] = [];
  for (const abs of (await listFiles(templateDir)).sort()) {
    let path = relative(templateDir, abs).split(sep).join('/');
    let content = await readFile(abs, 'utf8');
    if (path === 'package.json') {
      const pkg = JSON.parse(content) as Record<string, unknown>;
      pkg.name = opts.projectName;
      pkg.type = opts.moduleType;
      content = JSON.stringify(pkg, null, 2) + '\n';
    } else if (path === '.env.example') {
      content = content.replace('OPENAI_API_KEY', opts.apiKeyEnvVar);
    } else if (path.endsWith('.ts')) {
      content = content
        .replaceAll('assistantAgent', ids.camel)
        .replaceAll("'assistant-agent'", `'${ids.kebab}'`)
        .replaceAll('./agents/assistant-agent', `./agents/${ids.kebab}`)
        .replaceAll("name: 'Assistant'", `name: ${JSON.stringify(opts.agentName.trim())}`)
        .replaceAll("'openai/gpt-5-mini'", `'${opts.modelId}'`);
      path = path.replace('agents/assistant-agent.ts', `agents/${ids.kebab}.ts`);
    }
    files.push({ path, content, role: FILE_ROLES[path] ?? (path.includes('/agents/') ? agentRole(path) : 'Project file') });
  }
  return files;
}
