import { z } from 'zod';

// Configure before modules that parse catalog/API schemas. Zod's JIT probe otherwise emits a CSP violation.
z.config({ jitless: true });
