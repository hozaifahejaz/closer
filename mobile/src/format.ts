// One way to write numbers everywhere: 1,378 (not 1378).
export const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;
// What is being played, in a few words.
export const deckName = (decks: string[]) => !decks.length ? 'All decks' : decks.length === 1 ? decks[0] : `${decks.length} decks`;
