/** Timing helpers for goal-met celebrate pulse / occasional replay (#86). */

/** Resting → peak → resting grow pulse duration (CSS must match). */
export const CELEBRATE_PULSE_DURATION_MS = 700;

/** Inclusive lower bound between occasional replays while goal remains met. */
export const CELEBRATE_PULSE_REPLAY_MIN_MS = 8_000;

/** Inclusive upper bound between occasional replays while goal remains met. */
export const CELEBRATE_PULSE_REPLAY_MAX_MS = 16_000;

/**
 * Next delay until a celebrate pulse replay (ms).
 * Jittered so multiple met rows don't pulse in lockstep.
 */
export function nextCelebratePulseDelayMs(random: () => number = Math.random): number {
  const span = CELEBRATE_PULSE_REPLAY_MAX_MS - CELEBRATE_PULSE_REPLAY_MIN_MS;
  const unit = Math.min(1, Math.max(0, random()));
  return Math.round(CELEBRATE_PULSE_REPLAY_MIN_MS + unit * span);
}

export type CelebratePulseSchedulerOptions = {
  /** Called to run one pulse animation (meet or replay). */
  onPulse: () => void;
  /** When true, never schedules pulses (static splashier icon only). */
  prefersReducedMotion: boolean;
  /**
   * When true (default), fire `onPulse` once immediately on start (goal-met),
   * then schedule occasional replays. When false, only schedule replays
   * (e.g. if CSS handles the first meet animation on mount).
   */
  pulseOnStart?: boolean;
  schedule?: (fn: () => void, ms: number) => CelebratePulseTimerId;
  clear?: (id: CelebratePulseTimerId) => void;
  random?: () => number;
};

/** Opaque timer id — works with both DOM `number` and Node `Timeout` handles. */
export type CelebratePulseTimerId = ReturnType<typeof setTimeout> | number;

export type CelebratePulseScheduler = {
  start: () => void;
  stop: () => void;
};

/**
 * Schedules grow→shrink celebrate pulses while a goal remains met.
 * Call `stop()` when the goal is cleared / no longer met (unmount).
 */
export function createCelebratePulseScheduler(
  options: CelebratePulseSchedulerOptions,
): CelebratePulseScheduler {
  const schedule: (fn: () => void, ms: number) => CelebratePulseTimerId =
    options.schedule ?? ((fn, ms) => setTimeout(fn, ms) as CelebratePulseTimerId);
  const clear: (id: CelebratePulseTimerId) => void =
    options.clear ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const random = options.random ?? Math.random;
  const pulseOnStart = options.pulseOnStart !== false;

  let timer: CelebratePulseTimerId | null = null;
  let running = false;

  const clearTimer = () => {
    if (timer !== null) {
      clear(timer);
      timer = null;
    }
  };

  const armReplay = () => {
    clearTimer();
    if (!running) return;
    timer = schedule(() => {
      timer = null;
      if (!running) return;
      options.onPulse();
      armReplay();
    }, nextCelebratePulseDelayMs(random));
  };

  return {
    start() {
      if (running) return;
      running = true;
      if (options.prefersReducedMotion) return;
      if (pulseOnStart) options.onPulse();
      armReplay();
    },
    stop() {
      running = false;
      clearTimer();
    },
  };
}
