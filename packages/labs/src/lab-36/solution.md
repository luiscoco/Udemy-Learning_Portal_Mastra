# Solution: content-first ingestion

```ts
export async function ingest(file: { name: string; type: string; dataBase64: string }) {
  const name = basename(file.name);                                        // never trust a client path
  const expected = EXTENSIONS[extname(name).toLowerCase()];
  if (!expected) return reject('UNSUPPORTED_TYPE');
  const bytes = decodeBase64Strict(file.dataBase64);                       // INVALID_ENCODING
  if (bytes.length > MAX_BYTES) return reject('FILE_TOO_LARGE');           // measured, not declared
  if (bytes.length === 0) return reject('EMPTY_FILE');
  if (binarySignature(bytes)) return reject('EXECUTABLE_CONTENT');         // MZ, ELF, ZIP, PNG…
  if ((expected === 'application/pdf') !== looksLikePdf(bytes)) return reject('MIME_MISMATCH');
  if (!declaredTypeFits(file.type, expected)) return reject('MIME_MISMATCH');
  const text = expected === 'application/pdf'
    ? await extractPdf(bytes)                                              // pdf.js: page, char and time limits
    : decodeUtf8Strict(bytes);                                             // NOT_TEXT on binary noise
  if (!text.trim()) return reject('NO_TEXT');
  return { status: 'ingested', sha256: sha256(bytes), text };
}
```

In the Mastra workflow, pass references and keep the bytes out:

```ts
createWorkflow({ id: 'document-ingestion', inputSchema: z.array(FileRef), outputSchema: Catalogue })
  .foreach(ingestFile, { concurrency: 2 }) // the step reads bytes from an app-side map by index
  .then(catalogue)                         // dedupe by SHA-256, store new documents
  .commit();
```

Test each rejection code with its own fixture, and test the valid TXT, Markdown and PDF files.

**Challenge (DOCX):** a DOCX is a ZIP (`PK\x03\x04`), so it trips the archive rule. Allow ZIPs only when the extension is `.docx` and the archive contains `[Content_Types].xml` with a `wordprocessingml` main part. Reject everything else, including macro-enabled `.docm` files. Bound the number of entries and the uncompressed size, so a zip bomb cannot exhaust memory.
