// @ts-check
/**
 * Scrollbars inside the builder's frames (the GrapesJS canvas, the preview),
 * as in the Fimainfo extranet: a 5.6 px gutter, a 2.8 px thumb, no arrows,
 * shown only while the pointer is over the scrolling block. A frame is a
 * document of its own, so `styles.css` does not reach it — the same rules
 * are injected into it. Added to the canvas and the preview only, never to
 * the HTML that is saved or sent.
 *
 * Chromium ≥ 121 drops `::-webkit-scrollbar` (and brings back the arrows)
 * as soon as `scrollbar-width` or `scrollbar-color` is set, so those two are
 * kept for Firefox alone.
 */
export const FRAME_SCROLLBAR_CSS = `
::-webkit-scrollbar{width:5.6px;height:5.6px;background:transparent}
::-webkit-scrollbar-button{display:none;width:0;height:0}
::-webkit-scrollbar-track,::-webkit-scrollbar-track-piece,::-webkit-scrollbar-corner{background:transparent;border:0;box-shadow:none}
::-webkit-scrollbar-thumb{background-color:rgba(156,163,175,.45);border:1.4px solid transparent;background-clip:content-box;border-radius:9999px;min-height:2rem;min-width:2rem}
::-webkit-scrollbar-thumb:hover{background-color:rgba(107,114,128,.7)}
@supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:rgba(156,163,175,.45) transparent}}
@media (hover:hover) and (pointer:fine){
::-webkit-scrollbar-thumb{background-color:transparent}
*:hover::-webkit-scrollbar-thumb{background-color:rgba(156,163,175,.45)}
*:hover::-webkit-scrollbar-thumb:hover{background-color:rgba(107,114,128,.7)}
@supports not selector(::-webkit-scrollbar){*{scrollbar-color:transparent transparent}*:hover{scrollbar-color:rgba(156,163,175,.45) transparent}}
}`;
