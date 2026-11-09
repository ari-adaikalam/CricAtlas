import { createContext } from 'react';

/** Where the ball filters of the view on screen are drawn on a phone: inside the Filters sheet, beside Format, Competition and Season. null everywhere else, and for a view that is kept but not shown, so the bar stays in its own view. */
export const BallSlot = createContext<HTMLElement | null>(null);
