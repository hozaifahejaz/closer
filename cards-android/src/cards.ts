import DECK from './data/questions.json';
import { makeGame } from './game';

// Every deck and question ships inside the app (a copy of the repo's questions.json,
// kept in step by `npm run sync-questions`), so nothing is ever downloaded.
export const game = makeGame(DECK as Record<string, (string | null)[]>);
