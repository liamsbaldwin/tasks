/**
 * The tab and home-screen icon: the page's blue down the left three tenths, paper for
 * the rest. Served as real files next to the page, not as data: URLs in the head — Safari
 * shows no tab icon for a data: URL. Each link carries a hash of its bytes, because
 * browsers keep a favicon by URL, often for good, and a changed icon has to be a new URL.
 * bin/bundle.mjs writes the files and bin/serve.mjs serves them.
 */
import { createHash } from "node:crypto";

const png = b64 => Buffer.from(b64, "base64");
export const ICONS = {
  "favicon.png": png("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWUlEQVR42u3PAQkAIAwAsGsTA9jLOBY7VrKDIChsDVb6XHEkR4sH1PicgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwH0bD7kDYo8CSFcAAAAASUVORK5CYII="),
  "apple-touch-icon.png": png("iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAABUUlEQVR42u3SQQ0AIAwAsYGTCcAXcjBGsDQVBB6thMu1sU78bc8MXugSYA7MgTkwB+bAHJgDc2AOzAHmwByYA3NgDsyBOTAH5sAcYA7MgTkwB+bAHJgDc2AOzAHmwByYA3NgDsyBOTAH5sAcmAPMgTkwB+bAHJgDc2AOzIE5wByYA3NgDsyBOTAH5sAcmAPMgTkwB+bAHJgDc2AOzIE5MAeYA3NgDsyBOTAH5sAcmANzgDkwB+bAHJgDc2AOzIE5MAeYA3NgDsyBOTAH5sAcmANzYA4wB+bAHJgDc2AOzIE5MAfmAHNgDsyBOTAH5sAcmANzYA4wB+bAHJgDc2AOzIE5MAfmwBxgDsyBOTAH5sAcmANzYA7MAebAHJgDc2AOzIE5MAfmwBxgDsyBOTAH5sAcmANzYA7MgTnAHJgDc2AOzIE5MAfmwByYA8yBOTAHtxT8wgRKnlImpgAAAABJRU5ErkJggg=="),
};
// /favicon.ico is a real icon file, 16, 32 and 48 pixels drawn as bitmaps. Safari keeps
// the .ico icons of other sites but stored nothing for this one while the .ico was the
// PNG under another name, so it gets the format it is surest of, and the head links it.
const BLUE = [0x2D, 0x90, 0xCF], PAPER = [0xFA, 0xF8, 0xF0];
function bitmap(n) {
  const edge = Math.round(n * 0.3), mask = Math.ceil(n / 32) * 4;
  const out = Buffer.alloc(40 + n * n * 4 + mask * n);
  out.writeUInt32LE(40, 0); out.writeInt32LE(n, 4); out.writeInt32LE(n * 2, 8);
  out.writeUInt16LE(1, 12); out.writeUInt16LE(32, 14);
  out.writeUInt32LE(n * n * 4 + mask * n, 20);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const [r, g, b] = x < edge ? BLUE : PAPER, at = 40 + (y * n + x) * 4;
    out[at] = b; out[at + 1] = g; out[at + 2] = r; out[at + 3] = 255;
  }
  return out;                                  // the AND mask stays zero: all opaque
}
function ico(sizes) {
  const images = sizes.map(bitmap), head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((n, i) => {
    const at = 6 + 16 * i;
    head[at] = n; head[at + 1] = n;
    head.writeUInt16LE(1, at + 4); head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(images[i].length, at + 8); head.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });
  return Buffer.concat([head, ...images]);
}
ICONS["favicon.ico"] = ico([16, 32, 48]);

const v = name => createHash("sha256").update(ICONS[name]).digest("hex").slice(0, 10);
export const FAVICON =
  `<link rel="icon" href="/favicon.ico?v=${v("favicon.ico")}" sizes="16x16 32x32 48x48">` +
  `<link rel="icon" type="image/png" href="/favicon.png?v=${v("favicon.png")}" sizes="64x64">` +
  `<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${v("apple-touch-icon.png")}">`;
