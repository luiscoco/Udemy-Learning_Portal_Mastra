# Proposal

## Why

Module 08 (RAG and Knowledge Systems) starts with getting documents in safely. Ingestion is where untrusted bytes meet the server, so learners need to see what a careful backend does:

- check size and type from the **content**, not from the file name or the browser's claim;
- reject malformed, disguised and oversized files with clear reasons;
- extract text on the server;
- keep raw bytes out of logs and traces.

Later labs (chunking, embeddings, retrieval, question answering) build on the documents ingested here.

## What Changes

- **Contract, additive.** A new input field kind, `file`, with `accept` (extensions), `maxBytes` (per file) and `maxFiles`. Its value is an array of `UploadedFile { name, type, size, dataBase64 }`, where every field is untrusted. New helpers:
  - `uploadedFilesSchema(field)` bounds the count and the encoded size per file;
  - `maxRequestBytes(definition)` gives the request body limit for a lab;
  - `FILE_TRANSPORT_FACTOR` (1.25): files up to 25 % above `maxBytes` still reach the server, so it can reject them individually.

  Existing field kinds and labs are unchanged.
- **API.** The JSON body limit stays at 64 KB for every request, except `POST /api/labs/:labId/runs` for a lab whose definition declares file fields. For those, the limit is `maxRequestBytes(definition)`. A larger body gets HTTP 413, and the message states the limit.
- **Web.** `DynamicForm` renders `file` fields as an accessible file picker. The browser reads files to base64, refuses files too large to send, warns about files over the limit (the server will reject them) and lets learners remove files. Uploads always start empty, and form values are not persisted.
- **New lab `lab-36`** (Module 08), offline only, no model. A `document-ingestion` workflow runs `.foreach(ingestFile, { concurrency: 2 })` followed by `catalogue`. It handles built-in fixtures generated in code (valid TXT, Markdown and PDF, plus malformed, disguised, mismatched, empty and oversized files) and learner uploads.
  - **Per-file pipeline:**
    1. sanitise the name;
    2. check the extension against the allowlist;
    3. strictly decode the base64;
    4. measure the size;
    5. refuse empty files;
    6. detect executable and archive signatures;
    7. sniff the content against the extension and the declared MIME type;
    8. extract the text: UTF-8 decoding and normalisation for text files, `unpdf` for PDFs with limits on pages, characters and time.
  - **Accepted documents** are stored, deduplicated by SHA-256, in a local document library under the data directory, for later labs.
  - **Raw bytes never enter workflow inputs, outputs or events.** Steps receive only an index and metadata.
- **Dependency.** `unpdf@1.8.1` (MIT; bundles pdf.js 6.1.200, with no runtime dependencies), pinned in `packages/labs` (server-only).

## Capabilities

### New Capabilities

- `course-labs/lab-36-document-ingestion`

### Modified Capabilities

(none). The `file` field is a new contract kind, documented in COMPATIBILITY.

## Impact

`packages/contracts` (additive), `apps/api` (body limit per lab), `apps/web` (file field), `packages/labs/src/lab-36/` and the dependency `unpdf`. No provider cost.
