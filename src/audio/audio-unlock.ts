/**
 * iOS Safari / WebKit AudioContext unlock helpers.
 *
 * iOS keeps a new AudioContext in "suspended" until create + resume (and
 * ideally a silent buffer kick) run *synchronously* inside a user-gesture
 * stack. Any `await` before those calls breaks the gesture chain and iOS
 * silently refuses playback — which is the #83 failure mode (noise +
 * meditation both mute; desktop Chrome OK).
 */

type AudioContextConstructor = typeof AudioContext;

/** Resolve AudioContext, including legacy webkitAudioContext on older iOS. */
export function getAudioContextConstructor(): AudioContextConstructor {
  const g = globalThis as typeof globalThis & {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) {
    throw new Error("Web Audio API is not available in this environment");
  }
  return Ctor;
}

/** Create a fresh AudioContext (webkit-safe). */
export function createAudioContext(
  options?: AudioContextOptions,
): AudioContext {
  const Ctor = getAudioContextConstructor();
  return options ? new Ctor(options) : new Ctor();
}

/**
 * Kick the destination with a one-sample silent buffer.
 * Helps older iOS and "running but silent" after backgrounding.
 * Must run synchronously inside the user-gesture stack.
 */
export function playSilentBuffer(ctx: BaseAudioContext): void {
  const frames = 1;
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  // Explicit zero fill — createBuffer is already silent, but keep intent clear.
  buffer.getChannelData(0).fill(0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

/**
 * Unlock / resume an AudioContext for iOS Safari.
 *
 * Call this *before any await* in a click/touch handler. The synchronous
 * `resume()` invocation (and silent buffer) is what satisfies WebKit; the
 * returned promise settles when the context actually reaches "running".
 */
export function unlockAudioContext(ctx: AudioContext): Promise<void> {
  try {
    playSilentBuffer(ctx);
  } catch {
    // Best-effort kick — resume still matters.
  }

  if (ctx.state === "running") {
    return Promise.resolve();
  }

  // Intentionally fire resume() synchronously; callers may await the result
  // later after other async work (worklet load) without losing the gesture.
  return ctx.resume().then(() => undefined);
}
