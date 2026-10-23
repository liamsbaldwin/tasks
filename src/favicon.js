/**
 * The tab and home-screen icon: the page's blue down the left three tenths, paper for
 * the rest. Inline PNGs, so there is no extra file to serve or cache. bin/bundle.mjs and
 * bin/serve.mjs both put this in the head.
 */
const ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWUlEQVR42u3PAQkAIAwAsGsTA9jLOBY7VrKDIChsDVb6XHEkR4sH1PicgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwH0bD7kDYo8CSFcAAAAASUVORK5CYII=";
const TOUCH = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAABUUlEQVR42u3SQQ0AIAwAsYGTCcAXcjBGsDQVBB6thMu1sU78bc8MXugSYA7MgTkwB+bAHJgDc2AOzAHmwByYA3NgDsyBOTAH5sAcYA7MgTkwB+bAHJgDc2AOzAHmwByYA3NgDsyBOTAH5sAcmAPMgTkwB+bAHJgDc2AOzIE5wByYA3NgDsyBOTAH5sAcmAPMgTkwB+bAHJgDc2AOzIE5MAeYA3NgDsyBOTAH5sAcmANzgDkwB+bAHJgDc2AOzIE5MAeYA3NgDsyBOTAH5sAcmANzYA4wB+bAHJgDc2AOzIE5MAfmAHNgDsyBOTAH5sAcmANzYA4wB+bAHJgDc2AOzIE5MAfmwBxgDsyBOTAH5sAcmANzYA7MAebAHJgDc2AOzIE5MAfmwBxgDsyBOTAH5sAcmANzYA7MgTnAHJgDc2AOzIE5MAfmwByYA8yBOTAHtxT8wgRKnlImpgAAAABJRU5ErkJggg==";

export const FAVICON =
  `<link rel="icon" type="image/png" href="${ICON}">` +
  `<link rel="apple-touch-icon" href="${TOUCH}">`;
