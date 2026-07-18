import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export type JobState = 'intake' | 'queued' | 'inProduction' | 'finished' | 'ready' | 'cancelled';

interface Transition {
  from: JobState;
  event: string;
  to: JobState;
}

const TRANSITIONS: Transition[] = [
  { from: 'intake', event: 'queue', to: 'queued' },
  { from: 'queued', event: 'start', to: 'inProduction' },
  { from: 'inProduction', event: 'finish', to: 'finished' },
  { from: 'finished', event: 'collect', to: 'ready' },
  { from: 'intake', event: 'cancel', to: 'cancelled' },
  { from: 'queued', event: 'cancel', to: 'cancelled' },
  { from: 'inProduction', event: 'cancel', to: 'cancelled' },
];

export function advanceJob(current: JobState, event: string): JobState {
  const transition = TRANSITIONS.find(
    (candidate): boolean => candidate.from === current && candidate.event === event,
  );
  if (!transition) {
    throw new BadRequestHttpError(`No transition for state '${current}' with event '${event}'`);
  }
  return transition.to;
}
