import type { ReactNode } from 'react';
import { BallLoader, Scene, type StateKind } from './Scene';
import s from './states.module.css';

interface Props {
  kind: StateKind;
  title: string;
  text: string;
  /** Page for a whole screen, tile for the inside of a chart tile. */
  size?: 'page' | 'tile';
  children?: ReactNode;
  /** Use role="alert" for failures and role="status" otherwise, so assistive technology announces the state. */
  live?: 'status' | 'alert';
}

export function StatePanel({ kind, title, text, size = 'page', children, live = kind === 'error' ? 'alert' : 'status' }: Props) {
  const Heading = size === 'page' ? 'h1' : 'h2';
  return (
    <div className={`${s.panel} ${size === 'page' ? s.page : s.tile}`} role={live}>
      {kind === 'loading' ? (
        <Heading className={s.loadingLine}><BallLoader />{title}</Heading>
      ) : (
        <>
          <Scene kind={kind} />
          <Heading>{title}</Heading>
        </>
      )}
      <p>{text}</p>
      {children && <div className={s.actions}>{children}</div>}
    </div>
  );
}

export const stateStyles = s;
