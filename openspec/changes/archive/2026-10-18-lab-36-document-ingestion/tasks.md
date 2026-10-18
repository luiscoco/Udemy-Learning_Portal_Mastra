# Tasks

## 1. Platform

- [x] 1.1 Contracts: `file` field kind, `UploadedFile`, `uploadedFilesSchema`, `maxRequestBytes`; verify contract tests
- [x] 1.2 API: per-lab JSON body limit and a 413 message with the limit; verify API tests (64 KB elsewhere, larger for file labs)
- [x] 1.3 Web: file field in DynamicForm and form-model; verify unit tests

## 2. Lab

- [x] 2.1 Ingestion pipeline (name, extension, base64, size, signatures, sniffing, text and PDF extraction) and fixtures generated in code; verify unit tests per rejection code
- [x] 2.2 Document-ingestion workflow (foreach plus catalogue), library with deduplication, lab run, definition, fixtures, solution; verify lab36.test.ts and conformance
- [x] 2.3 e2e: upload a file through the form

## 3. Verification

- [x] 3.1 `npm run verify`, `npm run test:e2e`; COMPATIBILITY and README updates

## Workflow follow-up

- Archive, commit and push.
