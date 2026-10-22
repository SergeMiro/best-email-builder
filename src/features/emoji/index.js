// @ts-check
/**
 * EMOJI feature: the Emojis button at the end of the canvas's ribbon, and the
 * panel it opens beside the canvas (`EmojiPanel`). The emojis themselves load
 * on first use (`emojis.js`).
 */

import { Smile } from 'lucide-react';
import EmojiPanel from './EmojiPanel.jsx';

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature} */
export const emojiFeature = {
  id: 'emoji',
  label: 'Emojis',
  order: 9,
  drawer: { icon: Smile, label: 'Emojis', title: 'Insert an emoji', panel: EmojiPanel },
};
