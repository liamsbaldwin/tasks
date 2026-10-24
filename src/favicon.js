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
// Browsers that ask for /favicon.ico before reading the page get the same image.
ICONS["favicon.ico"] = ICONS["favicon.png"];

const v = name => createHash("sha256").update(ICONS[name]).digest("hex").slice(0, 10);
export const FAVICON =
  `<link rel="icon" type="image/png" href="/favicon.png?v=${v("favicon.png")}">` +
  `<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${v("apple-touch-icon.png")}">`;
