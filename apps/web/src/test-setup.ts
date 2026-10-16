import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Web tests share CPU with heavy lab tests (e.g. the TypeScript compiler in lab-01) during `npm test`.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());
