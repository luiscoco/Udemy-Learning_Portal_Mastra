import type { CatalogLab, ProgressStatus } from '@mlp/contracts';
import { CheckCircleIcon, CircleIcon, HalfCircleIcon, LockIcon } from './ui/icons';

export type DisplayStatus = 'locked' | ProgressStatus;

export function displayStatus(lab: CatalogLab, progress: ProgressStatus | undefined): DisplayStatus {
  if (lab.status === 'locked') return 'locked';
  return progress ?? 'not-started';
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  locked: 'Locked',
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
};

export function LabStatusIcon({ status, className }: { status: DisplayStatus; className?: string }) {
  const props = { className, title: STATUS_LABEL[status] };
  switch (status) {
    case 'locked':
      return <LockIcon {...props} />;
    case 'completed':
      return <CheckCircleIcon {...props} />;
    case 'in-progress':
      return <HalfCircleIcon {...props} />;
    default:
      return <CircleIcon {...props} />;
  }
}
