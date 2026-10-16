import type { RuntimeMode } from '@mlp/contracts';
import { getMastraVersion } from '@mlp/mastra-runtime';

/**
 * Server-side adapters handed to every lab through RunContext.services.
 * Later labs extend this (model factory, storage…); values never reach the client.
 */
export interface LabServices {
  readonly serverMode: RuntimeMode;
  readonly mastraVersion: string;
}

export interface LabServicesConfig {
  serverMode: RuntimeMode;
}

export function createLabServices(config: LabServicesConfig): LabServices {
  return { serverMode: config.serverMode, mastraVersion: getMastraVersion() };
}
