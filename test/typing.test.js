import { test } from "node:test";
import assert from "node:assert/strict";
import { correction } from "../src/typing.js";

/** Type `text` one character at a time through the corrector, the way the page does. */
function type(text, opts){
  let out = "";
  for(const ch of text){
    const fix = correction(out, ch, opts);
    out = fix ? out.slice(0, out.length - fix.len + 1) + fix.text : out + ch;
  }
  return out;
}
const prose = text => type(text, { sentences: true });

test("quotes curl the right way round", () => {
  assert.equal(type(`she said "it's done" and left`), "she said “it’s done” and left");
  assert.equal(type(`('quoted')`), "(‘quoted’)");
  assert.equal(type(`"start`), "“start");
});

test("two hyphens make a dash and three dots an ellipsis", () => {
  assert.equal(type("this--that"), "this—that");
  assert.equal(type("well..."), "well…");
  assert.equal(type("a well-made thing"), "a well-made thing");
});

test("common slips are fixed when the word ends, keeping its case", () => {
  assert.equal(type("teh map adn the "), "the map and the ");
  assert.equal(type("Teh end."), "The end.");
  assert.equal(type("TEH END "), "THE END ");
  assert.equal(type("i dont think so, i'm sure "), "I don’t think so, I’m sure ");
  assert.equal(type("THis is "), "This is ");
  assert.equal(type("IDs and MBAs "), "IDs and MBAs ");
});

test("an apostrophe does not end a word", () => {
  assert.equal(type("dont' "), "dont’ ");
  assert.equal(type("can't "), "can’t ");
});

test("sentences start with a capital in prose only", () => {
  assert.equal(prose("the map. it was wrong! so "), "The map. It was wrong! So ");
  assert.equal(type("the map. it was "), "the map. it was ");
});

test("abbreviations, initials and numbers do not end a sentence", () => {
  assert.equal(prose("See e.g. the map, cf. the survey, J. smith "), "See e.g. the map, cf. the survey, J. smith ");
  assert.equal(prose("In 3.5 percent "), "In 3.5 percent ");
  assert.equal(prose("e.g. this "), "e.g. this ");
});

test("words with a capital inside, addresses and maths are left alone", () => {
  assert.equal(prose("iPhone and eBay "), "iPhone and eBay ");
  assert.equal(type("see www.teh.com/teh "), "see www.teh.com/teh ");
  assert.equal(type("so $f'(x) -- teh$ "), "so $f'(x) -- teh$ ");
  assert.equal(type("$x$ and teh "), "$x$ and the ");
});

test("nothing to do is null", () => {
  assert.equal(correction("hello", "o"), null);
  assert.equal(correction("hello", " "), null);
  assert.equal(correction("", "ab"), null);
});
