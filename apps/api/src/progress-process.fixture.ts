import { emptyProgress } from '@mlp/contracts';
import { ProgressRepository } from './progress-store.js';

const [file, operation] = process.argv.slice(2);
if (!file || !['write', 'read'].includes(operation ?? '')) throw new Error('Expected a database path and write/read operation.');
const repository = new ProgressRepository(() => file);
if (operation === 'write')
  await repository.write('process-test', 'lab-00', 0, {
    ...emptyProgress('lab-00'),
    notes: 'Saved in a different process',
    lessonRead: true,
  });
else process.stdout.write(JSON.stringify(await repository.get('process-test')));
