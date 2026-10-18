import type { LabDefinitionInput } from '@mlp/contracts';

export const lab36Definition = {
  id: 'lab-36',
  number: 36,
  title: 'Document ingestion',
  moduleId: 'module-08',
  summary:
    'Accept TXT, Markdown and PDF files safely: validate size and type from the content, reject malformed, disguised and oversized files with a reason, extract text on the server, and store each document once.',
  concept:
    'Retrieval-augmented generation starts with documents, and ingestion is where untrusted bytes meet your server. ' +
    'A file name and the type a browser declares are only claims: the server must measure the decoded size, recognise executables and archives by their first bytes, and check that a “.pdf” really starts like a PDF. ' +
    'Text files must be valid UTF-8 without binary noise; PDFs are parsed with pdf.js under limits on pages, characters and time, and a PDF without extractable text (a scanned page) is rejected rather than stored empty. ' +
    'Each rejection carries a specific reason, so a learner, a user or a support engineer can tell an oversized file from a broken or disguised one. ' +
    'Size limits work in layers: the browser refuses files that are far too large to send, the API caps the request body for this lab, and the pipeline rejects each file over the per-file limit. ' +
    'Raw bytes never go into workflow inputs, outputs or events: the Mastra workflow steps receive an index and metadata, and the trace shows previews only. ' +
    'Accepted documents are stored in a local library keyed by their SHA-256 hash, so ingesting the same content twice stores it once; the next labs chunk, embed and search this library.',
  objectives: [
    'Validate uploads by measured size and sniffed content, not by name or declared type',
    'Reject malformed, disguised, empty and oversized files with specific reasons',
    'Extract text from TXT, Markdown and PDF on the server within limits',
    'Keep raw bytes out of traces and store documents idempotently',
  ],
  prerequisites: ['lab-35'],
  inputs: [
    {
      kind: 'select',
      name: 'samples',
      label: 'Built-in fixtures',
      options: [
        { value: 'mixed', label: 'Valid and problem files (10)' },
        { value: 'valid', label: 'Valid files only (3)' },
        { value: 'none', label: 'None (only my uploads)' },
      ],
      default: 'mixed',
      required: true,
    },
    {
      kind: 'file',
      name: 'files',
      label: 'Your files (optional)',
      help: 'TXT, Markdown or PDF. Files are sent with the run and checked by the server; nothing is kept unless it is ingested.',
      accept: ['.txt', '.md', '.markdown', '.pdf'],
      maxBytes: 1_048_576,
      maxFiles: 3,
      required: false,
    },
    { kind: 'boolean', name: 'store', label: 'Store ingested documents in the course library', default: true, required: true },
  ],
  exampleInput: { samples: 'mixed', files: [], store: true },
  expectedOutput: {
    description:
      'handbook.md, shipping-guide.txt and the two-page warranty.pdf are ingested. broken.pdf (MALFORMED_PDF), blank.pdf (NO_TEXT), invoice.txt with an executable header (EXECUTABLE_CONTENT), notes.pdf that is really text (MIME_MISMATCH), setup.exe (UNSUPPORTED_TYPE), empty.txt (EMPTY_FILE) and a 1 MiB + 1 byte log (FILE_TOO_LARGE) are rejected.',
    example: {
      samples: 'mixed',
      workflowStatus: 'success',
      summary: {
        ingested: 3,
        rejected: 7,
        duplicates: 0,
        byCode: { MALFORMED_PDF: 1, NO_TEXT: 1, EXECUTABLE_CONTENT: 1, MIME_MISMATCH: 1, UNSUPPORTED_TYPE: 1, EMPTY_FILE: 1, FILE_TOO_LARGE: 1 },
      },
      files: [
        { name: 'handbook.md', status: 'ingested', detectedType: 'text/markdown', containsExpected: true },
        { name: 'shipping-guide.txt', status: 'ingested', detectedType: 'text/plain', containsExpected: true },
        { name: 'warranty.pdf', status: 'ingested', detectedType: 'application/pdf', pages: 2, containsExpected: true },
        { name: 'broken.pdf', status: 'rejected', code: 'MALFORMED_PDF' },
        { name: 'blank.pdf', status: 'rejected', code: 'NO_TEXT' },
        { name: 'invoice.txt', status: 'rejected', code: 'EXECUTABLE_CONTENT', reason: 'content is a Windows executable (MZ), whatever the name says' },
        { name: 'notes.pdf', status: 'rejected', code: 'MIME_MISMATCH' },
        { name: 'setup.exe', status: 'rejected', code: 'UNSUPPORTED_TYPE' },
        { name: 'empty.txt', status: 'rejected', code: 'EMPTY_FILE' },
        { name: 'huge-log.txt', status: 'rejected', code: 'FILE_TOO_LARGE', measuredSize: 1_048_577 },
      ],
      library: { stored: true },
    },
  },
  guide: {
    procedure: [
      'Open ingest.ts in the Source tab: follow ingestFile from the name check to text extraction, and note the order of the checks.',
      'Run the example. In the result, compare each file’s declaredType and declaredSize with detectedType and measuredSize.',
      'Look at the timeline: what do the ingestFile steps receive and return? Is any file content in there?',
      'Run again: what does the library say about the three documents now?',
      'Upload a Markdown file of your own, then a photo renamed to .txt, then a PDF exported from a word processor.',
      'Choose “Valid files only” and upload the same file twice in one run: what is the second one marked as?',
    ],
    prediction: 'invoice.txt has a .txt name and a text/plain declared type, but starts with the bytes “MZ”. What will the pipeline do?',
    hints: [
      { level: 1, text: 'The pipeline looks at the content, not the label.' },
      { level: 2, text: '“MZ” is the signature of Windows executables.' },
      { level: 3, text: 'It is rejected with EXECUTABLE_CONTENT before any text decoding is attempted.' },
    ],
    commonMistakes: [
      { mistake: 'Trusting the file extension or the browser’s MIME type.', fix: 'Sniff the content and require it to agree with the extension.' },
      { mistake: 'Checking the declared size.', fix: 'Measure the decoded bytes on the server.' },
      { mistake: 'Storing PDFs that have no text layer.', fix: 'Reject them (NO_TEXT) or send them to OCR explicitly.' },
      { mistake: 'Logging uploads or putting bytes in workflow state.', fix: 'Pass references and metadata; keep bytes in memory only for the request.' },
    ],
    challenge: {
      prompt: 'Add DOCX support. Which signature does a DOCX start with, why does that collide with the ZIP rule, and how would you tell a DOCX from any other ZIP safely?',
      successCriteria: ['A DOCX is recognised by its ZIP structure ([Content_Types].xml)', 'Other ZIPs are still rejected'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'A file is named report.pdf and declared as application/pdf, but its content is plain text. What should happen?',
      choices: ['Ingest it as a PDF', 'Reject it as a type mismatch', 'Rename it to .txt silently', 'Ask the model'],
      correctIndex: 1,
      explanation: 'The content decides; a mismatch is a reason to reject.',
    },
    {
      id: 'q2',
      prompt: 'Where must the size limit be enforced?',
      choices: ['Only in the browser', 'On the server, on the decoded bytes', 'On the declared size', 'In the model prompt'],
      correctIndex: 1,
      explanation: 'The browser can be bypassed and declared sizes are claims.',
    },
    {
      id: 'q3',
      prompt: 'Why do the workflow steps receive an index instead of the file bytes?',
      choices: ['It is faster', 'So raw content never enters traces, events or persisted state', 'Mastra cannot handle bytes', 'To save tokens'],
      correctIndex: 1,
      explanation: 'Traces are shown to learners and could be stored.',
    },
    {
      id: 'q4',
      prompt: 'The same file is ingested twice. What does the library do?',
      choices: ['Stores two copies', 'Keeps one record, keyed by the content hash', 'Deletes both', 'Throws an error'],
      correctIndex: 1,
      explanation: 'SHA-256 naming makes storing idempotent.',
    },
  ],
  sourceFiles: [
    { path: 'ingest.ts', title: 'Ingestion pipeline', description: 'Name, extension, base64, size, signatures, sniffing and text/PDF extraction.' },
    { path: 'pipeline.ts', title: 'Workflow', description: 'foreach over file references and the catalogue step.' },
    { path: 'library.ts', title: 'Document library', description: 'Idempotent storage keyed by SHA-256.' },
    { path: 'samples.ts', title: 'Fixtures', description: 'Generated valid and problem files, including a minimal PDF writer.' },
    { path: 'run.ts', title: 'Lab run', description: 'Fixture expectations and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, write an ingestion function that sniffs content, measures size, rejects with specific codes and extracts text, and test it with one fixture per rejection code plus valid TXT, Markdown and PDF files.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'fixtures-ingested', label: 'The valid fixtures were ingested and their text was extracted' },
    { id: 'malformed-rejected', label: 'Malformed, disguised, mismatched and empty files were rejected with the right reason' },
    { id: 'oversize-rejected', label: 'Files over the size limit were rejected (measured on the decoded bytes)' },
    { id: 'uploads-decided', label: 'Every uploaded file was either ingested with text or rejected with a reason' },
    { id: 'no-raw-bytes-in-trace', label: 'No raw file bytes appeared in the workflow trace or events' },
    { id: 'library-deduplicated', label: 'Each ingested document is stored exactly once in the library (by content hash)' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Untrusted bytes', minutes: 1, talkingPoints: ['Names and MIME types are claims'] },
      { title: 'Layers of limits', minutes: 1, talkingPoints: ['Browser, request body, per file'] },
      { title: 'Sniffing and rejection codes', minutes: 2, talkingPoints: ['Signatures', 'Mismatch', 'Empty and no-text'] },
      { title: 'Extraction', minutes: 1.5, talkingPoints: ['UTF-8 and normalisation', 'pdf.js with limits'] },
      { title: 'Traces and library', minutes: 1.5, talkingPoints: ['References, not bytes', 'SHA-256 idempotency', 'Next: chunking'] },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: {},
    costNotice: 'No model is called. Uploaded files are processed on this server; ingested documents are stored in the local course library under the data directory.',
  },
  tags: ['rag', 'ingestion', 'uploads', 'validation', 'pdf', 'security'],
} satisfies LabDefinitionInput;
