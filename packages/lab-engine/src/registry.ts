import { LabDefinitionSchema, type LabDefinition } from '@mlp/contracts';
import { LabError, zodDetails } from './errors.js';
import type { AnyLabImplementation } from './types.js';

export class LabRegistry<S = unknown> {
  private readonly labs = new Map<string, AnyLabImplementation<S>>();

  constructor(labs: AnyLabImplementation<S>[] = []) {
    for (const lab of labs) this.register(lab);
  }

  /** Validates the definition, source paths and example input, then registers the lab. */
  register(lab: AnyLabImplementation<S>): void {
    const parsed = LabDefinitionSchema.safeParse(lab.definition);
    if (!parsed.success) {
      const where = zodDetails(parsed.error)
        .map((d) => `${d.path}: ${d.message}`)
        .join('; ');
      throw new Error(`Invalid lab definition for ${String(lab.definition?.id)}: ${where}`);
    }
    const def = parsed.data;
    if (this.labs.has(def.id)) throw new Error(`Lab ${def.id} is already registered`);

    const example = lab.inputSchema.safeParse(def.exampleInput);
    if (!example.success) {
      throw new Error(`Lab ${def.id} exampleInput does not satisfy its inputSchema`);
    }
    const fieldNames = new Set(def.inputs.map((f) => f.name));
    for (const key of Object.keys(def.exampleInput)) {
      if (!fieldNames.has(key)) throw new Error(`Lab ${def.id} exampleInput key "${key}" has no input field`);
    }
    const quizIds = new Set<string>();
    for (const q of def.quiz) {
      if (quizIds.has(q.id)) throw new Error(`Lab ${def.id} has duplicate quiz id ${q.id}`);
      quizIds.add(q.id);
    }
    // Store the parsed (defaults applied) definition.
    this.labs.set(def.id, { ...lab, definition: def });
  }

  get(labId: string): AnyLabImplementation<S> | undefined {
    return this.labs.get(labId);
  }

  require(labId: string): AnyLabImplementation<S> {
    const lab = this.labs.get(labId);
    if (!lab) throw new LabError('NOT_FOUND', `Unknown lab "${labId}"`);
    return lab;
  }

  definitions(): LabDefinition[] {
    return [...this.labs.values()].map((l) => l.definition).sort((a, b) => a.number - b.number);
  }

  ids(): string[] {
    return this.definitions().map((d) => d.id);
  }
}
