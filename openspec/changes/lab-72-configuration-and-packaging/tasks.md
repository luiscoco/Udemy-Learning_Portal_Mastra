# Tasks

## 1. Deployment config
- [ ] 1.1 `@mlp/deploy`: schema moved from the API, secret files, production profile rules, readiness probe
- [ ] 1.2 The API re-exports the config, startup refuses with exit code 78, TRUST_PROXY, access logs, `/api/ready`
- [ ] 1.3 Contracts (`ReadinessResponseSchema`, login kind `password`), client `ready()`, route class

## 2. Production identity
- [ ] 2.1 `PasswordIdentityProvider` (scrypt) and the `auth:hash-user` script
- [ ] 2.2 Login page label for password login

## 3. Packaging
- [ ] 3.1 Dockerfile, .dockerignore, compose.yaml with secrets, make-secrets script
- [ ] 3.2 Container smoke script and CI job; docs/DEPLOYMENT-CONFIG.md

## 4. Lab 72
- [ ] 4.1 Configuration doctor lab (offline and live provider probe), registry and catalog
- [ ] 4.2 Unit, API and e2e tests; live check; container CI evidence
