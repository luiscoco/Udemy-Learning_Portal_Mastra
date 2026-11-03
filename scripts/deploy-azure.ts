// Repeatable staging deployment to Azure Container Apps (L73). Idempotent: run it again to deploy a new commit.
//   npm run deploy:azure                    build the current commit in ACR and roll it out
//   npm run deploy:azure -- --rollback      run the previous release's image again
//   options: --rg mlp-staging-rg --location westeurope --app mlp-staging --allow-dirty
// Needs: Azure CLI signed in (az login). No local Docker: the image is built by `az acr build`.
// Secrets are generated once into secrets/staging/ (gitignored) and are never printed.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashUserEntry } from '../packages/auth/src/index.ts';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const flag = (name: string) => args.includes(`--${name}`);
const RG = opt('rg', 'mlp-staging-rg');
const LOCATION = opt('location', 'northeurope');
const APP = opt('app', 'mlp-staging');
const ENV = `${APP}-env`;
const IDENTITY = `${APP}-id`;
const SHARE = 'mlpdata';
const dir = join(process.cwd(), 'secrets', 'staging');
mkdirSync(dir, { recursive: true });

const log = (msg: string) => process.stdout.write(`[deploy] ${msg}\n`);
const quote = (a: string) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);

/** Runs az and returns stdout. On Windows az is a .cmd, so it runs through the shell with quoted arguments. */
function az(cmd: string[], opts: { allowFail?: boolean; json?: boolean; quiet?: boolean } = {}): string {
  const full = [...cmd, ...(opts.json === false ? [] : ['-o', 'json']), '--only-show-errors'];
  const r = spawnSync(process.platform === 'win32' ? 'az' : 'az', full.map(quote), {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', opts.quiet ? 'pipe' : 'inherit'],
  });
  if (r.status !== 0 && !opts.allowFail) throw new Error(`az ${cmd.slice(0, 3).join(' ')} failed (exit ${r.status})`);
  return r.status === 0 ? r.stdout.trim() : '';
}
const azJson = <T>(cmd: string[], allowFail = false): T | null => {
  const out = az(cmd, { allowFail, quiet: allowFail });
  return out ? (JSON.parse(out) as T) : null;
};

function secretFile(name: string, make: () => string | Promise<string>): Promise<string> | string {
  const file = join(dir, name);
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const write = (v: string) => {
    writeFileSync(file, `${v}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    log(`created secrets/staging/${name}`);
    return v;
  };
  const v = make();
  return typeof v === 'string' ? write(v) : v.then(write);
}

interface Release {
  tag: string;
  image: string;
  revision: string;
  at: string;
  kind: 'deploy' | 'rollback';
}
const releasesFile = join(dir, 'releases.json');
const releases = (): Release[] => (existsSync(releasesFile) ? (JSON.parse(readFileSync(releasesFile, 'utf8')) as Release[]) : []);
const record = (r: Release) => writeFileSync(releasesFile, JSON.stringify([...releases(), r], null, 2));

async function waitReady(fqdn: string, timeoutMs = 600_000): Promise<number> {
  const started = Date.now();
  let last = 'no answer';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`https://${fqdn}/api/ready`, { signal: AbortSignal.timeout(15_000) });
      if (res.status === 200) return Date.now() - started;
      last = `status ${res.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`https://${fqdn}/api/ready did not become ready: ${last}`);
}

const appState = () =>
  azJson<{
    properties: {
      latestRevisionName: string;
      configuration: { ingress: { fqdn: string } };
      template: { containers: { image: string }[] };
    };
  }>(['containerapp', 'show', '-g', RG, '-n', APP], true);

async function main() {
  const account = azJson<{ id: string; name: string }>(['account', 'show'])!;
  log(`subscription: ${account.name}`);
  if (!az(['extension', 'show', '--name', 'containerapp'], { allowFail: true, quiet: true })) {
    log('installing the Azure CLI containerapp extension');
    az(['extension', 'add', '--name', 'containerapp', '--upgrade'], { json: false });
  }
  const suffix = createHash('sha256').update(`${account.id}/${RG}`).digest('hex').slice(0, 6);
  const ACR = `mlpstaging${suffix}`;
  const STORAGE = `mlpstg${suffix}`;

  if (flag('rollback')) {
    const history = releases();
    const current = appState();
    const currentImage = current?.properties.template.containers[0]?.image;
    const previous = [...history].reverse().find((r) => r.image !== currentImage);
    if (!current || !previous) throw new Error('Nothing to roll back to: releases.json has no earlier image.');
    log(`rolling back ${currentImage} → ${previous.image}`);
    az(['containerapp', 'update', '-g', RG, '-n', APP, '--image', previous.image]);
    const s = appState()!;
    const ms = await waitReady(s.properties.configuration.ingress.fqdn);
    record({
      tag: previous.tag,
      image: previous.image,
      revision: s.properties.latestRevisionName,
      at: new Date().toISOString(),
      kind: 'rollback',
    });
    log(`rolled back; ready after ${Math.round(ms / 1000)} s at https://${s.properties.configuration.ingress.fqdn}`);
    return;
  }

  const dirty = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
  if (dirty && !flag('allow-dirty'))
    throw new Error('The working tree has uncommitted changes; commit first or pass --allow-dirty.');
  const tag = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).stdout.trim() + (dirty ? '-dirty' : '');

  log(`resource group ${RG} (${LOCATION})`);
  az(['group', 'create', '-n', RG, '-l', LOCATION, '--tags', 'project=mastra-learning-platform', 'stage=staging']);

  if (!azJson(['acr', 'show', '-g', RG, '-n', ACR], true)) {
    log(`container registry ${ACR} (Basic)`);
    az(['acr', 'create', '-g', RG, '-n', ACR, '-l', LOCATION, '--sku', 'Basic', '--admin-enabled', 'false']);
  }
  const acr = azJson<{ id: string; loginServer: string }>(['acr', 'show', '-g', RG, '-n', ACR])!;
  const image = `${acr.loginServer}/mastra-learning-platform:${tag}`;
  log(`building ${image} in ACR (the build log follows)`);
  az(['acr', 'build', '-r', ACR, '-t', `mastra-learning-platform:${tag}`, '--platform', 'linux/amd64', '.'], { json: false });

  if (!azJson(['identity', 'show', '-g', RG, '-n', IDENTITY], true)) {
    log(`managed identity ${IDENTITY}`);
    az(['identity', 'create', '-g', RG, '-n', IDENTITY, '-l', LOCATION]);
  }
  const identity = azJson<{ id: string; principalId: string }>(['identity', 'show', '-g', RG, '-n', IDENTITY])!;
  const pulls =
    azJson<unknown[]>([
      'role',
      'assignment',
      'list',
      '--assignee',
      identity.principalId,
      '--scope',
      acr.id,
      '--role',
      'AcrPull',
    ]) ?? [];
  if (pulls.length === 0) {
    log('granting AcrPull to the identity');
    az([
      'role',
      'assignment',
      'create',
      '--assignee-object-id',
      identity.principalId,
      '--assignee-principal-type',
      'ServicePrincipal',
      '--role',
      'AcrPull',
      '--scope',
      acr.id,
    ]);
  }

  if (!azJson(['storage', 'account', 'show', '-g', RG, '-n', STORAGE], true)) {
    log(`storage account ${STORAGE} and file share ${SHARE}`);
    az([
      'storage',
      'account',
      'create',
      '-g',
      RG,
      '-n',
      STORAGE,
      '-l',
      LOCATION,
      '--sku',
      'Standard_LRS',
      '--kind',
      'StorageV2',
      '--min-tls-version',
      'TLS1_2',
      '--allow-blob-public-access',
      'false',
    ]);
  }
  const keys = azJson<{ value: string }[]>(['storage', 'account', 'keys', 'list', '-g', RG, '-n', STORAGE])!;
  const storageKey = keys[0]!.value;
  az(['storage', 'share-rm', 'create', '-g', RG, '--storage-account', STORAGE, '-n', SHARE, '--quota', '5'], {
    allowFail: true,
    quiet: true,
  });

  if (!azJson(['containerapp', 'env', 'show', '-g', RG, '-n', ENV], true)) {
    log(`Container Apps environment ${ENV} (takes a few minutes)`);
    az(['containerapp', 'env', 'create', '-g', RG, '-n', ENV, '-l', LOCATION]);
  }
  const env = azJson<{ id: string }>(['containerapp', 'env', 'show', '-g', RG, '-n', ENV])!;
  az(
    [
      'containerapp',
      'env',
      'storage',
      'set',
      '-g',
      RG,
      '-n',
      ENV,
      '--storage-name',
      SHARE,
      '--azure-file-account-name',
      STORAGE,
      '--azure-file-account-key',
      storageKey,
      '--azure-file-share-name',
      SHARE,
      '--access-mode',
      'ReadWrite',
    ],
    { quiet: true },
  );

  const sessionSecret = await secretFile('auth_session_secret', () => randomBytes(32).toString('base64url'));
  const auditKey = await secretFile('audit_hmac_key', () => randomBytes(32).toString('base64url'));
  const password = await secretFile('learner-password', () => randomBytes(15).toString('base64url'));
  const users = await secretFile('auth_users', () => hashUserEntry('learner', password));

  const yaml = `location: ${LOCATION}
identity:
  type: UserAssigned
  userAssignedIdentities:
    "${identity.id}": {}
properties:
  managedEnvironmentId: ${env.id}
  configuration:
    activeRevisionsMode: Single
    ingress:
      external: true
      targetPort: 8787
      allowInsecure: false
      transport: auto
    registries:
      - server: ${acr.loginServer}
        identity: ${identity.id}
    secrets:
      - name: auth-session-secret
        value: "${sessionSecret}"
      - name: audit-hmac-key
        value: "${auditKey}"
      - name: auth-users
        value: "${users}"
  template:
    revisionSuffix: r${Date.now().toString(36)}
    containers:
      - name: api
        image: ${image}
        resources:
          cpu: 0.5
          memory: 1Gi
        env:
          - { name: NODE_ENV, value: production }
          - { name: MLP_DATA_DIR, value: /data }
          - { name: TRUST_PROXY, value: "1" }
          - { name: LOG_LEVEL, value: info }
          - { name: MASTRA_MODE, value: offline }
          - { name: AUTH_PROVIDER, value: password }
          - { name: AUTH_SESSION_SECRET, secretRef: auth-session-secret }
          - { name: AUDIT_HMAC_KEY, secretRef: audit-hmac-key }
          - { name: AUTH_USERS, secretRef: auth-users }
        probes:
          - type: Liveness
            httpGet: { path: /api/health, port: 8787 }
            initialDelaySeconds: 5
            periodSeconds: 10
          - type: Readiness
            httpGet: { path: /api/ready, port: 8787 }
            initialDelaySeconds: 3
            periodSeconds: 10
        volumeMounts:
          - { volumeName: data, mountPath: /data }
    scale:
      minReplicas: 0
      maxReplicas: 1
    volumes:
      - name: data
        storageType: AzureFile
        storageName: ${SHARE}
        mountOptions: "dir_mode=0777,file_mode=0777,uid=1000,gid=1000,nobrl,mfsymlinks,cache=none"
`;
  const yamlFile = join(dir, 'app.yaml'); // holds secret values: gitignored, owner-only
  writeFileSync(yamlFile, yaml, { mode: 0o600 });
  const exists = Boolean(appState());
  log(`${exists ? 'updating' : 'creating'} Container App ${APP} with ${image}`);
  az(['containerapp', exists ? 'update' : 'create', '-g', RG, '-n', APP, '--yaml', yamlFile], { quiet: false });

  const s = appState()!;
  const fqdn = s.properties.configuration.ingress.fqdn;
  log(`waiting for https://${fqdn}/api/ready`);
  const ms = await waitReady(fqdn);
  record({ tag, image, revision: s.properties.latestRevisionName, at: new Date().toISOString(), kind: 'deploy' });
  writeFileSync(join(dir, 'url'), `https://${fqdn}\n`);
  log(`deployed ${tag} as ${s.properties.latestRevisionName}; ready after ${Math.round(ms / 1000)} s`);
  log(`URL: https://${fqdn}   (sign in as "learner"; the password is in secrets/staging/learner-password)`);
}

main().catch((e) => {
  process.stderr.write(`[deploy] FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
