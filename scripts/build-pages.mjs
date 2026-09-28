// Builds the public, search-friendly pages from questions.json and the deck
// names, colours and art in public/play.html:
//
//   public/index.html              landing page
//   public/decks.html              every deck
//   public/decks/<deck>.html       one page per deck with its questions
//   public/questions/<topic>.html  question lists for common searches
//   public/404.html
//   worker/pages.json              the page list the Worker's sitemap.xml uses
//
// Run `node scripts/build-pages.mjs` after changing questions or decks, and commit
// the result. Absolute links use https://__SITE__, which the Worker swaps for the
// address the page is served from (see seoPage in worker/index.js).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = f => readFileSync(ROOT + f, 'utf8');
const write = (f, s) => { writeFileSync(ROOT + f, s); };

const SITE = 'https://__SITE__';
const NAME = 'Duet Deck';

// ---- Deck data ----
const QUESTIONS = JSON.parse(read('questions.json'));
const PLAY = read('public/play.html');
const objectLiteral = name => {
  const start = PLAY.indexOf(`const ${name} = {`);
  const end = PLAY.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error(`${name} not found in play.html`);
  return new Function(`return ${PLAY.slice(start + `const ${name} = `.length, end + 2)}`)();
};
const BLURBS = objectLiteral('DECK_BLURBS');
const ART = objectLiteral('DECK_ART');
const COLORS = { All: ['#9b5aa6', '#5a2d66'], 'Getting Closer': ['#f08a7e', '#c9486a'] };
for (const m of PLAY.matchAll(/\.tile\[data-deck="([^"]+)"\] \{ --c1:(#\w+); --c2:(#\w+); \}/g)) COLORS[m[1]] = [m[2], m[3]];

// What each deck page is called in search results: "<deck>: <count> <phrase>".
const PHRASES = {
  'Getting Closer': 'questions to get closer as a couple',
  'Who You Are': 'questions to really get to know your partner',
  'Us & The Future': 'questions about your future together',
  'Honest & Vulnerable': 'deep, vulnerable questions for couples',
  'Light & Playful': 'fun questions for couples',
  'Desire & Intimacy': 'intimate questions for couples',
  'Conflict & Repair': 'questions about fighting fair and making up',
  'Life & Meaning': 'big life questions to ask your partner',
  'Guess My Answer': 'guess-my-answer questions for couples',
  'Would You Rather': 'would you rather questions for couples',
  'Weekly Check-in': 'weekly relationship check-in questions',
  'Dilemmas': 'moral dilemma questions for couples',
  'Long Distance': 'long distance relationship questions',
  'Midnight Questions': 'late-night questions for couples',
  'Money & Work': 'money and career questions for couples',
  'Alien Interview': 'questions for explaining life to an alien',
  'Genie Wishes': 'genie wish questions for couples',
  'Amnesia': 'amnesia what-if questions for couples',
  'Act It Out': 'act-it-out prompts for couples',
  'Job Interview': 'job interview questions for your partner',
  'Unsent': 'unsent message prompts for couples',
  'Bad Advice': 'bad advice prompts for couples',
  'How Much Would You Pay': 'how much would you pay questions',
  'The Worst': 'funny "the worst" questions for couples',
  'Tiny Vows': 'tiny vow prompts for couples',
  'Comfort Codes': 'questions about how you like to be comforted',
};

const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const DECKS = Object.keys(QUESTIONS).map(name => {
  const questions = QUESTIONS[name].filter(Boolean);
  for (const k of ['BLURBS', 'ART', 'COLORS', 'PHRASES']) {
    if (!{ BLURBS, ART, COLORS, PHRASES }[k][name]) throw new Error(`${name} is missing from ${k}`);
  }
  return { name, slug: slug(name), questions, blurb: BLURBS[name], art: ART[name], colors: COLORS[name], phrase: PHRASES[name] };
});
const BY_NAME = Object.fromEntries(DECKS.map(d => [d.name, d]));
const TOTAL = DECKS.reduce((n, d) => n + d.questions.length, 0);
const fmt = n => n.toLocaleString('en-US');

// k questions spread evenly through a deck; offset (0 to 1) shifts the picks so
// two lists drawn from the same deck don't repeat each other.
const spread = (deck, k, offset = 0) => {
  const qs = BY_NAME[deck].questions;
  k = Math.min(k, qs.length);
  const picked = [];
  for (let i = 0; i < k; i++) picked.push(qs[Math.floor(((i + offset) * qs.length) / k) % qs.length]);
  return [...new Set(picked)];
};

// ---- Question lists for common searches ----
const LISTS = [
  { slug: 'deep', title: 'Deep questions for couples', short: 'Deep questions',
    intro: ['Questions that go past "how was your day". They are about who you are, what you are afraid of, what you believe and what you want from life.',
      'Take them slowly. One good question can fill a whole evening, and there is no need to get through the list.'],
    from: [['Who You Are', 8], ['Honest & Vulnerable', 8], ['Life & Meaning', 8], ['Midnight Questions', 8], ['Us & The Future', 8]] },
  { slug: 'to-ask-your-girlfriend', title: 'Questions to ask your girlfriend', short: 'For your girlfriend',
    intro: ['Whether you have been together three weeks or three years, there is always more to learn about her. These questions start light and get deeper as you go.',
      'Ask one, listen to the whole answer, and then answer it yourself too.'],
    from: [['Getting Closer', 8], ['Who You Are', 8], ['Light & Playful', 8], ['Honest & Vulnerable', 8], ['Us & The Future', 8]] },
  { slug: 'to-ask-your-boyfriend', title: 'Questions to ask your boyfriend', short: 'For your boyfriend',
    intro: ['Good questions for getting him talking, from easy and funny to the things he might not bring up on his own.',
      'Ask one, listen to the whole answer, and then answer it yourself too.'],
    from: [['Getting Closer', 8, 0.5], ['Who You Are', 8, 0.5], ['Light & Playful', 8, 0.5], ['Honest & Vulnerable', 8, 0.5], ['Us & The Future', 8, 0.5]] },
  { slug: 'for-long-distance-couples', title: 'Questions for long distance couples', short: 'Long distance',
    intro: ['Being apart makes conversation matter more. These questions are for video calls, late-night texts and the days you miss each other most.',
      'In Duet Deck you each open the game on your own phone and see the same card at the same time, wherever you are.'],
    from: [['Long Distance', 20], ['Weekly Check-in', 8], ['Getting Closer', 6], ['Unsent', 6]] },
  { slug: 'before-marriage', title: 'Questions to ask before marriage', short: 'Before marriage',
    intro: ['The talks worth having before you share a life: money, family, conflict, what you want the years ahead to look like.',
      'None of these have right answers. The point is to know where each of you stands.'],
    from: [['Us & The Future', 10], ['Money & Work', 8], ['Conflict & Repair', 8], ['Life & Meaning', 8], ['Tiny Vows', 3]] },
  { slug: 'for-date-night', title: 'Date night questions', short: 'Date night',
    intro: ['A mix of easy, funny and deeper questions for dinner, a walk or a night in.',
      'Start with a couple of light ones and see where the conversation goes.'],
    from: [['Getting Closer', 8, 0.3], ['Light & Playful', 8, 0.3], ['Guess My Answer', 8], ['Would You Rather', 8], ['Midnight Questions', 8, 0.5]] },
  { slug: 'funny', title: 'Funny questions for couples', short: 'Funny questions',
    intro: ['Silly, strange and nostalgic questions for when you want to laugh together.',
      'Some of them turn out to be surprisingly revealing.'],
    from: [['Light & Playful', 14, 0.7], ['Would You Rather', 8, 0.5], ['Alien Interview', 6], ['Act It Out', 6], ['Bad Advice', 3], ['The Worst', 3]] },
  { slug: 'intimate', title: 'Intimate questions for couples', short: 'Intimate questions',
    intro: ['Questions about touch, attraction, feeling wanted and feeling safe with each other.',
      'Go at the pace that feels right for both of you. Skipping a card is always fine.'],
    from: [['Desire & Intimacy', 20], ['Honest & Vulnerable', 10, 0.25], ['Comfort Codes', 6]] },
  { slug: 'to-get-to-know-each-other', title: 'Get to know you questions for couples', short: 'Get to know each other',
    intro: ['For new couples, and for long-time couples who suspect there is still a lot they don\'t know.',
      'Guess each other\'s answers first for extra fun.'],
    from: [['Getting Closer', 8, 0.75], ['Who You Are', 10, 0.25], ['Guess My Answer', 8, 0.5], ['Job Interview', 6]] },
];

// ---- HTML helpers ----
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const artSvg = (deck, cls = 'art') => {
  const [viewBox, drawing] = deck.art;
  return `<span class="${cls}" aria-hidden="true"><svg viewBox="${viewBox}">${drawing}</svg></span>`;
};
const deckStyle = d => `--c1:${d.colors[0]};--c2:${d.colors[1]}`;
const ld = obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const crumbs = items => ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })) });

const LOGO = `<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.6" y="4.2" width="10.4" height="14.6" rx="2.2" transform="rotate(-13 8.8 11.5)" fill="#fff" opacity=".5"/><rect x="9.6" y="5" width="10.4" height="14.6" rx="2.2" transform="rotate(9 14.8 12.3)" fill="#fff"/><path transform="rotate(9 14.8 12.3)" d="M14.8 15.6c-.1 0-.2 0-.3-.1-1.7-1.5-2.8-2.5-2.8-3.8 0-.9.7-1.6 1.6-1.6.6 0 1.1.3 1.5.8.4-.5.9-.8 1.5-.8.9 0 1.6.7 1.6 1.6 0 1.3-1.1 2.3-2.8 3.8-.1.1-.2.1-.3.1z" fill="#b8527a"/></svg>`;

function page({ path, title, description, image = '/og/duet-deck.jpg', body, head = '', noindex = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${SITE}${path}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1d1420">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css">
${head}</head>
<body>
<header class="nav">
  <a class="brand" href="/"><span class="badge">${LOGO}</span><span>${NAME}</span></a>
  <nav><a href="/decks">Decks</a><a class="hide-sm" href="/questions/deep">Questions</a><a class="btn small" href="/play">Play free</a></nav>
</header>
${body}
<footer class="foot">
  <div class="foot-cols">
    <div><a class="brand" href="/"><span class="badge">${LOGO}</span><span>${NAME}</span></a><p>Deep questions for two. Same card, same moment, wherever you are.</p></div>
    <div><h2>Question lists</h2>${LISTS.map(l => `<a href="/questions/${l.slug}">${esc(l.short)}</a>`).join('')}</div>
    <div><h2>Popular decks</h2>${['Getting Closer', 'Midnight Questions', 'Long Distance', 'Would You Rather', 'Desire & Intimacy', 'Dilemmas'].map(n => `<a href="/decks/${slug(n)}">${esc(n)}</a>`).join('')}<a href="/decks">All ${DECKS.length} decks</a></div>
    <div><h2>${NAME}</h2><a href="/play">Play</a><a href="/privacy">Privacy policy</a></div>
  </div>
</footer>
</body>
</html>
`;
}

const deckTile = d => `<a class="tile" href="/decks/${d.slug}" style="${deckStyle(d)}">${artSvg(d)}<span class="t">${esc(d.name)}</span><span class="n">${d.questions.length} cards</span></a>`;
const cta = (text = 'Play free with your partner') => `<a class="btn" href="/play">${esc(text)}</a>`;

// ---- Landing page ----
function landing() {
  const sample = BY_NAME['Midnight Questions'];
  const faqs = [
    [`Is ${NAME} free?`, `Yes. You can play every deck for free in your browser, on a phone or a computer. There is nothing to download.`],
    ['Do we need to be in the same place?', `No. Each of you opens ${NAME} on your own phone, and you both see the same card at the same moment, wherever you are. It works just as well sitting side by side, or on one phone passed back and forth.`],
    ['Does my partner need an account?', 'No. Start a room and send your partner the four-letter code. If you want to keep your answers, favorites and place in each deck, you can each make a free account and link once.'],
    ['What is Answer & reveal?', 'A way to play where you each type an answer without seeing the other\'s. Both answers appear once you have both answered, so you can compare and talk about it.'],
    ['How many questions are there?', `${fmt(TOTAL)} questions in ${DECKS.length} decks, from easy and playful to deep and vulnerable. Pick one deck or mix as many as you like.`],
    ['Is there an app?', `${NAME} works in any browser, and you can add it to your home screen from your browser's menu. Apps for iPhone and Android are on the way.`],
  ];
  const body = `
<main>
  <section class="hero">
    <div class="hero-text">
      <p class="eyebrow">Question cards for couples</p>
      <h1>Deep questions for two, on the same card at the same time</h1>
      <p class="lede">${NAME} is a card game for couples. You each open it on your own phone and flip through ${fmt(TOTAL)} questions together, in sync, whether you are on the same sofa or in different countries.</p>
      <div class="actions">${cta('Play free in your browser')}<a class="btn ghost" href="/decks">Browse the ${DECKS.length} decks</a></div>
      <p class="fine">Free. No download. Your partner joins with a four-letter code.</p>
    </div>
    <div class="hero-cards" aria-hidden="true">
      <div class="cb c1"></div><div class="cb c2"></div>
      <div class="qcard" style="${deckStyle(sample)}">${artSvg(sample, 'art small')}<small>${esc(sample.name)}</small><p>${esc(sample.questions[0])}</p></div>
    </div>
  </section>

  <section class="band">
    <h2>How it works</h2>
    <ol class="steps">
      <li><b>Start a room</b><span>Pick one deck or mix several. ${NAME} deals the cards.</span></li>
      <li><b>Your partner joins</b><span>Send the four-letter code. They open it on their phone, anywhere in the world.</span></li>
      <li><b>Flip together</b><span>Every flip, skip and deck change shows on both phones at once.</span></li>
    </ol>
  </section>

  <section class="two">
    <div><h2>Just talk</h2><p>Read the card out loud and talk it through. The simplest way to play on a date, a road trip or a video call.</p></div>
    <div><h2>Answer &amp; reveal</h2><p>Each of you types an answer without seeing the other's. Both appear once you have both answered. Good for Guess My Answer, and for questions that are easier to write than to say.</p></div>
  </section>

  <section>
    <div class="section-head"><h2>${DECKS.length} decks, ${fmt(TOTAL)} questions</h2><a href="/decks">See all ${DECKS.length} decks</a></div>
    <div class="tiles">${[...DECKS].sort((a, b) => b.questions.length - a.questions.length).slice(0, 12).map(deckTile).join('')}</div>
  </section>

  <section>
    <div class="section-head"><h2>Question lists</h2></div>
    <div class="chips">${LISTS.map(l => `<a class="chip" href="/questions/${l.slug}">${esc(l.title)}</a>`).join('')}</div>
  </section>

  <section class="faq">
    <h2>Questions about ${NAME}</h2>
    ${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n    ')}
  </section>

  <section class="final">
    <h2>Tonight, ask something new</h2>
    <p>It takes ten seconds to start a room.</p>
    ${cta('Play free')}
  </section>
</main>`;
  const head = ld({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', name: NAME, url: SITE + '/' },
    { '@type': 'WebApplication', name: NAME, url: SITE + '/play', applicationCategory: 'GameApplication', operatingSystem: 'Any web browser',
      description: `A question card game for couples with ${fmt(TOTAL)} questions in ${DECKS.length} decks. Both partners see the same card at the same time.`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
    { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ] }) + `
<script>
// Old invite links (/?room=CODE) and returning players go straight to the game.
try {
  if (/[?&]room=/.test(location.search)) location.replace('/play' + location.search);
  else if (localStorage.getItem('closer:token') && !document.referrer.startsWith(location.origin)) location.replace('/play');
} catch {}
</script>
`;
  return page({ path: '/', title: `${NAME} · Deep Questions for Couples, Played Together`,
    description: `A free question card game for couples. ${fmt(TOTAL)} deep, funny and intimate questions in ${DECKS.length} decks, and you both see the same card at the same moment, wherever you are.`,
    body, head });
}

// ---- All decks ----
function decksPage() {
  const body = `
<main>
  <nav class="crumbs"><a href="/">Home</a><span>Decks</span></nav>
  <header class="page-head">
    <h1>All ${DECKS.length} question decks</h1>
    <p class="lede">${fmt(TOTAL)} questions for couples, from warm and easy to deep, funny and intimate. Play one deck or mix any of them together.</p>
    ${cta()}
  </header>
  <div class="deck-list">${DECKS.map(d => `
    <a class="deck-row" href="/decks/${d.slug}" style="${deckStyle(d)}">${artSvg(d)}<span><b>${esc(d.name)}</b><span>${esc(d.blurb)}</span></span><span class="n">${d.questions.length}</span></a>`).join('')}
  </div>
  <section><div class="section-head"><h2>Question lists</h2></div>
    <div class="chips">${LISTS.map(l => `<a class="chip" href="/questions/${l.slug}">${esc(l.title)}</a>`).join('')}</div></section>
</main>`;
  return page({ path: '/decks', title: `All ${DECKS.length} Question Decks for Couples · ${NAME}`,
    description: `Browse ${DECKS.length} decks with ${fmt(TOTAL)} questions for couples: Getting Closer, Midnight Questions, Long Distance, Would You Rather and more.`,
    body, head: crumbs([['Home', '/'], ['Decks', '/decks']]) });
}

// ---- One deck ----
function deckPage(d) {
  const others = DECKS.filter(o => o !== d);
  const i = DECKS.indexOf(d);
  const related = [1, 2, 3, 4, 5, 6].map(k => others[(i + k * 4) % others.length]);
  const n = d.questions.length;
  const title = `${d.name}: ${n} ${d.phrase}`;
  const body = `
<main style="${deckStyle(d)}">
  <nav class="crumbs"><a href="/">Home</a><a href="/decks">Decks</a><span>${esc(d.name)}</span></nav>
  <header class="deck-head">
    ${artSvg(d, 'art big')}
    <div>
      <p class="eyebrow">${n} ${n === 1 ? 'card' : 'cards'}</p>
      <h1>${esc(title)}</h1>
      <p class="lede">${esc(d.blurb)} Play the ${esc(d.name)} deck in ${NAME}: you and your partner see the same card at the same time, on your own phones, wherever you are.</p>
      ${cta(`Play ${d.name} free`)}
    </div>
  </header>
  <ol class="qlist">${d.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol>
  <section class="final small">${cta(`Play ${d.name} with your partner`)}</section>
  <section><div class="section-head"><h2>More decks</h2><a href="/decks">All ${DECKS.length} decks</a></div>
    <div class="tiles">${related.map(deckTile).join('')}</div></section>
</main>`;
  return page({ path: `/decks/${d.slug}`, title: `${title} · ${NAME}`,
    description: `${d.blurb} ${n} ${d.phrase} from the ${d.name} deck, free to read or play together in ${NAME}.`,
    image: `/og/${d.slug}.jpg`, body,
    head: crumbs([['Home', '/'], ['Decks', '/decks'], [d.name, `/decks/${d.slug}`]]) });
}

// ---- One question list ----
function listPage(l) {
  const sections = l.from.map(([deck, k, offset]) => ({ d: BY_NAME[deck], qs: spread(deck, k, offset) }));
  const count = sections.reduce((n, s) => n + s.qs.length, 0);
  const others = LISTS.filter(o => o !== l);
  let num = 0;
  const body = `
<main>
  <nav class="crumbs"><a href="/">Home</a><span>${esc(l.title)}</span></nav>
  <header class="page-head">
    <p class="eyebrow">${count} questions</p>
    <h1>${esc(l.title)}</h1>
    ${l.intro.map(p => `<p class="lede">${esc(p)}</p>`).join('')}
    ${cta('Play these with your partner')}
  </header>
  ${sections.map(({ d, qs }) => `
  <section class="list-part" style="${deckStyle(d)}">
    <div class="part-head">${artSvg(d, 'art small')}<h2>From ${esc(d.name)}</h2><a href="/decks/${d.slug}">All ${d.questions.length}</a></div>
    <ol class="qlist" start="${num + 1}" style="counter-reset:q ${num}">${qs.map(q => (num++, `<li>${esc(q)}</li>`)).join('')}</ol>
  </section>`).join('')}
  <section class="final small"><h2>Ask them as cards</h2><p>In ${NAME} you both see the same question at the same moment, on your own phones.</p>${cta('Play free')}</section>
  <section><div class="section-head"><h2>More question lists</h2></div>
    <div class="chips">${others.map(o => `<a class="chip" href="/questions/${o.slug}">${esc(o.title)}</a>`).join('')}</div></section>
</main>`;
  return page({ path: `/questions/${l.slug}`, title: `${count} ${l.title} · ${NAME}`,
    description: `${count} ${l.title.toLowerCase()}. ${l.intro[0]}`, body,
    head: crumbs([['Home', '/'], [l.title, `/questions/${l.slug}`]]) });
}

function notFound() {
  return page({ path: '/404', title: `Page not found · ${NAME}`, description: 'This page does not exist.',
    body: `<main><section class="final"><h1>This card isn't in the deck</h1><p>The page you were looking for doesn't exist.</p><div class="actions">${cta('Play free')}<a class="btn ghost" href="/decks">Browse the decks</a></div></section></main>`, noindex: true });
}

// ---- Write everything ----
rmSync(ROOT + 'public/decks', { recursive: true, force: true });
rmSync(ROOT + 'public/questions', { recursive: true, force: true });
mkdirSync(ROOT + 'public/decks', { recursive: true });
mkdirSync(ROOT + 'public/questions', { recursive: true });
write('public/index.html', landing());
write('public/decks.html', decksPage());
for (const d of DECKS) write(`public/decks/${d.slug}.html`, deckPage(d));
for (const l of LISTS) write(`public/questions/${l.slug}.html`, listPage(l));
write('public/404.html', notFound());
write('worker/pages.json', JSON.stringify(['/', '/play', '/decks', ...DECKS.map(d => `/decks/${d.slug}`), ...LISTS.map(l => `/questions/${l.slug}`), '/privacy'], null, 1) + '\n');
// For scripts/build-og.mjs.
write('scripts/og-decks.json', JSON.stringify(DECKS.map(({ name, slug, colors, art, questions }) => ({ name, slug, colors, art, count: questions.length, sample: questions[0] })), null, 1) + '\n');
console.log(`Built ${3 + DECKS.length + LISTS.length} pages (${DECKS.length} decks, ${LISTS.length} lists, ${fmt(TOTAL)} questions).`);
