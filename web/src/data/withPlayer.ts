import { setPlayer } from './store';

// The query engine reads the current player's files under fixed names (store.ts, engine.ts), so two players' questions must never run at the same time. The Compare pages ask about two players:
// each player's questions run inside `withPlayer`, one player after the other, and a new player's files replace the last one's only when the last one's questions have finished.

let tail: Promise<unknown> = Promise.resolve();

/** Runs `work` with `playerId` as the current player, after every earlier call has finished. */
export function withPlayer<T>(playerId: string, work: () => Promise<T>): Promise<T> {
  const run = tail.then(() => { setPlayer(playerId); return work(); });
  tail = run.catch(() => undefined);
  return run;
}
