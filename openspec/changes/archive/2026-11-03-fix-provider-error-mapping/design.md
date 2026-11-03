# Design

`providerStatusOf(err, depth = 0)` walks `err`, `err.cause`, `err.lastError` and the entries of `err.errors`, up to depth 4. It returns the first integer `statusCode` between 400 and 599 that it finds.

This works for the AI SDK `APICallError` (`statusCode`) and for Mastra's retry wrappers that keep the last error. Only the status code is read. Provider messages can echo request data, so they are never forwarded.

The mapping runs after the `LabError`, `ZodError` and abort checks and before the `INTERNAL` fallback, so the current behaviour of every existing error kind is unchanged.
