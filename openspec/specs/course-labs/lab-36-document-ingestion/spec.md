# course-labs/lab-36-document-ingestion Specification

## Purpose
Lab 36 ingests TXT, Markdown and PDF documents through a size- and content-validated backend, rejects malformed, disguised and oversized files with specific reasons, extracts text server-side and stores each document once in a local library.

## Requirements

### Requirement: Validated document ingestion
Lab 36 SHALL ingest permitted TXT, Markdown and PDF files after server-side size and content-type validation, and extract their text on the server.

#### Scenario: Fixtures ingested
- **WHEN** the built-in valid fixtures run (Markdown, TXT, a two-page PDF)
- **THEN** each is ingested with extracted text containing its expected phrase, and stored once in the document library by SHA-256

#### Scenario: Re-ingesting the same content
- **WHEN** the same fixtures are ingested again
- **THEN** they are recognised as already stored and no second library record is created

### Requirement: Malformed and oversize files rejected
Files that are malformed, disguised, mismatched, empty or too large SHALL be rejected with a specific reason.

#### Scenario: Malformed fixtures
- **WHEN** the malformed fixtures run
- **THEN** they are rejected as `MALFORMED_PDF`, `NO_TEXT`, `EXECUTABLE_CONTENT`, `MIME_MISMATCH`, `UNSUPPORTED_TYPE` and `EMPTY_FILE` respectively

#### Scenario: Oversize file
- **WHEN** a file's decoded size exceeds the per-file limit
- **THEN** it is rejected as `FILE_TOO_LARGE` regardless of its declared size

#### Scenario: Request above the transport limit
- **WHEN** a run request body exceeds the lab's computed limit
- **THEN** the API answers 413 stating the limit, and labs without file fields keep the 64 KB limit

### Requirement: Raw bytes stay out of traces
No workflow event SHALL contain uploaded file bytes.

#### Scenario: Trace inspection
- **WHEN** the run's events are inspected
- **THEN** none contains a prefix of any file's base64 data
