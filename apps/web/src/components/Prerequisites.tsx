import { Link } from 'react-router';
import { getLab } from '@mlp/lab-catalog';
import { useAllProgress } from '../lib/progress-context';
import { Badge } from './ui/primitives';

/** Advisory prerequisite status: never blocks navigation, never invents completion. */
export function Prerequisites({ labIds }: { labIds: string[] }) {
  const progress = useAllProgress();
  if (labIds.length === 0) {
    return <p className="text-sm text-fg-muted">No prerequisites — you can start here.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Prerequisites">
      {labIds.map((id) => {
        const lab = getLab(id);
        const done = progress[id]?.status === 'completed';
        return (
          <li key={id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
            <Link to={`/labs/${id}`} className="text-accent underline-offset-2 hover:underline">
              {id}: {lab?.title ?? id}
            </Link>
            {done ? <Badge tone="success">Completed</Badge> : lab?.status === 'locked' ? <Badge>Locked</Badge> : <Badge tone="warning">Not completed</Badge>}
          </li>
        );
      })}
    </ul>
  );
}
