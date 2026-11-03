# Tasks

## 1. Deployment config
- [x] 1.1 `@mlp/deploy`: schema moved from the API, secret files, production profile rules, readiness probe
- [x] 1.2 The API re-exports the config, startup refuses with exit code 78, TRUST_PROXY, access logs, `/api/ready`
- [x] 1.3 Contracts (`ReadinessResponseSchema`, login kind `password`), client `ready()`, route class

## 2. Production identity
- [x] 2.1 `PasswordIdentityProvider` (scrypt) and the `auth:hash-user` script
- [x] 2.2 Login page label for password login

## 3. Packaging
- [x] 3.1 Dockerfile, .dockerignore, compose.yaml with secrets, make-secrets script
- [x] 3.2 Container smoke script and CI job; docs/DEPLOYMENT-CONFIG.md

## 4. Lab 72
- [x] 4.1 Configuration doctor lab (offline and live provider probe), registry and catalog
- [x] 4.2 Unit, API and e2e tests; live check; container CI evidence
