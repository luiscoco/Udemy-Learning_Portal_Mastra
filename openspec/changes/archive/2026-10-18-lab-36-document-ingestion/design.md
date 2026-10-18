# Design

## Context

- **No file upload or PDF extraction in the stack yet.** The installed Mastra packages provide neither. `@mastra/rag` (MDocument, chunking) is a later concern (L37).
- **PDF library choice.** `unpdf@1.8.1` exposes `getDocumentProxy(data, options)` and `extractText(pdf, { mergePages })`, and runs pdf.js serverless in Node with no worker. It bundles pdf.js 6.1.200, checked at runtime. That is well past the fix for CVE-2024-4367 (arbitrary JavaScript through font handling, fixed in 4.2.67). 1.9.0 was two days old, so the previous release is pinned.
- **Request bodies.** The API parsed every JSON body with a 64 KB limit.
- **The runner never echoes run input** to the client. Only events that labs emit reach the browser.

## Decisions

- **Transport: files travel inside the run request**, not through a separate upload endpoint. Nothing is written to disk before validation, there is no quarantine directory or cleanup job, and no upload ids need ownership. Three layers bound the size:
  1. the browser refuses files above `maxBytes × 1.25`;
  2. the API caps the body at `maxRequestBytes(definition)`, which returns 413 beyond it;
  3. the lab rejects each file above `maxBytes`, measured on the decoded bytes, with `FILE_TOO_LARGE`.
- **Limits for L36.**
  - Uploads: 1 MiB per file, at most 3 files. The request limit is about 5.2 MB for this lab only.
  - PDFs: at most 50 pages, 10 s extraction time.
  - Extracted text: at most 200,000 characters per document, flagged when truncated.
- **Content decides, in this order:**
  1. **Name:** strip path parts and control characters, at most 120 characters. Otherwise `INVALID_NAME`.
  2. **Extension:** must be in `.txt`, `.md`, `.markdown` or `.pdf`. Otherwise `UNSUPPORTED_TYPE`.
  3. **Encoding:** strict base64. Otherwise `INVALID_ENCODING`.
  4. **Size:** measured on the decoded bytes, against the 1 MiB limit (`FILE_TOO_LARGE`); zero bytes is `EMPTY_FILE`.
  5. **Binary signatures:** MZ, ELF, Mach-O, ZIP, GZIP, PNG, JPEG and GIF give `EXECUTABLE_CONTENT`.
  6. **Sniffing:** `.pdf` must contain `%PDF-` within its first 1,024 bytes. A text file must not be a PDF. The declared MIME type must be compatible with the extension (an empty type is allowed, because browsers often send none for `.md`). Any mismatch is `MIME_MISMATCH`.
  7. **Text files:** fatal UTF-8 decoding, then no NUL and less than 1 % control characters. Otherwise `NOT_TEXT`. The BOM is stripped, line endings become LF, and the text is NFC-normalised.
  8. **PDF files:** pdf.js runs with `disableFontFace: true` and `verbosity: 0`. pdf.js 6.1 removed `isEvalSupported`, and the bundle contains no `eval(` or `new Function` (checked). A password exception gives `ENCRYPTED_PDF`; any other parse error gives `MALFORMED_PDF`; more than the page limit gives `TOO_MANY_PAGES`; empty text gives `NO_TEXT` (for example a scanned page); exceeding the time limit gives `EXTRACTION_TIMEOUT`. The document is always destroyed afterwards.
- **Workflow.** `document-ingestion` runs `.foreach(ingestFile, { concurrency: 2 })` over file descriptors `{ index, name, declaredType, declaredSize, origin }`. The step reads the bytes from a closure map by index, and puts the extracted text in another app-side map. Step inputs and outputs are metadata and previews only, so the trace never holds raw or full content. Then `catalogue`:
  - marks repeated SHA-256 values within the batch as `duplicate`;
  - stores new documents in the library.
- **Library.** JSON records under `<memoryDir>/library/<sha256>.json`: `{ docId, name, mime, sha256, bytes, chars, pages, truncated, ingestedAt, text }`.
  - Writes are atomic: a temporary file, then a rename.
  - Storing is idempotent: an existing hash gives `stored: existing`.
  - The library is capped at 100 documents; beyond that the result is `stored: skipped (library full)`.
  - Paths are never returned to the client.
- **Fixtures are generated in code** (`makePdf` writes a minimal valid PDF with a correct xref table), so the repository has no binary files. Each sample declares its expected outcome:
  - accepted: `handbook.md`, `shipping-guide.txt` and `warranty.pdf` (two pages);
  - rejected: `broken.pdf` (`MALFORMED_PDF`), `blank.pdf` (`NO_TEXT`), `invoice.txt` with an MZ header (`EXECUTABLE_CONTENT`), `notes.pdf` containing plain text (`MIME_MISMATCH`), `setup.exe` (`UNSUPPORTED_TYPE`), `empty.txt` (`EMPTY_FILE`) and a 1 MiB + 1 byte text file (`FILE_TOO_LARGE`).
- **Checks:**
  - `fixtures-ingested`: the valid samples are ingested and their text contains the expected phrase;
  - `malformed-rejected`: each malformed sample gets its expected code;
  - `oversize-rejected`;
  - `uploads-decided`: every upload has a decision with a reason;
  - `no-raw-bytes-in-trace`: no event contains a prefix of any file's base64;
  - `library-deduplicated`: one library record per ingested hash.

## Risks

- **pdf.js runs in the API process.** It is a JavaScript parser, not code execution, and its bundle has no code-generation path (no `eval`/`new Function`). CPU-heavy files are bounded by size, page and time limits. The time limit cannot pre-empt synchronous work. The release gates already require a sandbox for anything beyond this.
- **Large learner files in memory.** They are bounded per lab by the request limit.
