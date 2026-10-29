/**
 * What the editor puts right as you type: curly quotes, dashes, the ellipsis, the usual
 * slips of the fingers and a capital at the start of a sentence.
 *
 * It is a pure function of the text before the caret and the character just typed, so
 * it can be tested in Node; the page applies the answer one character after it happens,
 * which is what lets the first ⌘Z undo a correction and keep what was actually typed.
 *
 * It errs towards leaving things alone. A correction nobody asked for is worse than a
 * typo, so nothing is touched inside maths, an address, or a word with a capital
 * already somewhere in it.
 */

/** Slips common enough that no one means them. Lower case; the typed case is kept, and
    the apostrophes are curled like every other one typed. */
export const TYPOS = {
  teh: "the", hte: "the", taht: "that", thta: "that", adn: "and", nad: "and",
  waht: "what", wiht: "with", whith: "with",
  jsut: "just", becuase: "because", beacuse: "because", becasue: "because",
  recieve: "receive", recieved: "received", beleive: "believe", belive: "believe",
  acheive: "achieve", wierd: "weird", freind: "friend", thier: "their",
  occured: "occurred", occurence: "occurrence", untill: "until", alot: "a lot",
  definately: "definitely", seperate: "separate", seperately: "separately",
  goverment: "government", enviroment: "environment", accomodate: "accommodate",
  arguement: "argument", existance: "existence", independant: "independent",
  neccessary: "necessary", necesary: "necessary", occassion: "occasion",
  publically: "publicly", tommorow: "tomorrow", tomorow: "tomorrow",
  wich: "which", whcih: "which", woudl: "would", coudl: "could", shoudl: "should",
  becomming: "becoming", begining: "beginning", calender: "calendar",
  concious: "conscious", embarass: "embarrass", foriegn: "foreign", gaurd: "guard",
  happend: "happened", knowlege: "knowledge", liason: "liaison", millenium: "millennium",
  noticable: "noticeable", persue: "pursue", posession: "possession", truely: "truly",
  dont: "don’t", doesnt: "doesn’t", didnt: "didn’t", isnt: "isn’t", wasnt: "wasn’t",
  arent: "aren’t", werent: "weren’t", havent: "haven’t", hasnt: "hasn’t",
  couldnt: "couldn’t", shouldnt: "shouldn’t", wouldnt: "wouldn’t", youre: "you’re",
  theyre: "they’re", thats: "that’s"
};

/** Words that end in a full stop without ending a sentence. */
const ABBR = new Set(["e.g", "i.e", "eg", "ie", "etc", "vs", "cf", "al", "mr", "mrs", "ms",
  "dr", "prof", "st", "no", "fig", "figs", "eq", "ch", "vol", "pp", "p", "ed", "eds", "approx", "c"]);

/** Typing one of these finishes the word before it. An apostrophe does not: "don't". */
const BOUNDARY = /^[\s.,;:!?)\]}"”]$/u;

const OPENS_AFTER = /(?:^|[\s(\[{—–\-\/“‘])$/u;

/** Inside $…$ while there is an odd number of unescaped dollars before the caret. */
const inMaths = text => ((text.match(/(?<!\\)\$/g) || []).length % 2) === 1;

function matchCase(typed, fix){
  if(typed.length > 1 && typed === typed.toUpperCase()) return fix.toUpperCase();
  if(typed[0] !== typed[0].toLowerCase()) return fix[0].toUpperCase() + fix.slice(1);
  return fix;
}

/** What the word just finished should be, or null to leave it as it is. */
function fixWord(before, typed, sentences){
  const token = /(\S+)$/u.exec(before)?.[1];
  if(!token) return null;
  // An address, an email or a path is not prose.
  if(/[\/@]|:\/\/|^www\./i.test(token)) return null;
  const pre = before.slice(0, -token.length);
  const lead = /^[(\["“‘']*/u.exec(token)[0];
  const word = token.slice(lead.length);
  if(!word) return null;

  let out = word;
  const lower = word.toLowerCase();
  if(/^\p{L}+$/u.test(word) && TYPOS[lower] && (word === lower || word === word.toUpperCase()
      || word === word[0].toUpperCase() + word.slice(1).toLowerCase())) out = matchCase(word, TYPOS[lower]);
  else if(word === "i") out = "I";
  else if(/^i['’](m|ll|ve|d)$/u.test(word)) out = "I" + word.slice(1);
  // Two capitals then lower case is a held Shift: THis → This. Two letters after it at
  // least, so IDs and MBAs are left alone.
  else if(/^\p{Lu}\p{Lu}\p{Ll}{2,}$/u.test(word)) out = word[0] + word.slice(1).toLowerCase();

  // A letter and a full stop is an initial or the start of "e.g.", not a word.
  const initial = typed === "." && word.length === 1;
  if(sentences && !initial && /^\p{Ll}[\p{Ll}'’-]*$/u.test(out) && lead === "" && startsSentence(pre))
    out = out[0].toUpperCase() + out.slice(1);

  return out === word ? null : { len: word.length, text: out };
}

function startsSentence(pre){
  if(/^\s*$/.test(pre)) return true;                        // the start of the paragraph
  const m = /(\S*?)([.!?])["”’)\]]*\s+$/u.exec(pre);
  if(!m) return false;
  if(m[2] !== ".") return true;
  const last = m[1].replace(/^[(\["“‘']+/u, "").toLowerCase();
  // An initial, an abbreviation, a number or a run of dots is not the end of a sentence.
  return !(last.length <= 1 || ABBR.has(last) || /\d/.test(last) || last.endsWith("."));
}

/**
 * The correction for one keystroke: `before` is the text of the paragraph up to where
 * `typed` went in. Returns { len, text } — replace the last `len` characters, the typed
 * one included, with `text` — or null when there is nothing to do.
 */
export function correction(before, typed, { sentences = false } = {}){
  if(typeof before !== "string" || typeof typed !== "string" || typed.length !== 1) return null;
  if(inMaths(before)) return null;

  let ch = typed, extra = 0;
  if(typed === '"') ch = OPENS_AFTER.test(before) ? "“" : "”";
  else if(typed === "'") ch = OPENS_AFTER.test(before) ? "‘" : "’";
  else if(typed === "-" && before.endsWith("-") && !before.endsWith("--")){ ch = "—"; extra = 1; }
  else if(typed === "." && before.endsWith("..") && !before.endsWith("...")){ ch = "…"; extra = 2; }
  if(extra) return { len: extra + 1, text: ch };

  const word = BOUNDARY.test(typed) ? fixWord(before, typed, sentences) : null;
  if(!word) return ch === typed ? null : { len: 1, text: ch };
  return { len: word.len + 1, text: word.text + ch };
}
