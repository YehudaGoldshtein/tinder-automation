/**
 * Tinder only supports BMP emojis (U+0000–U+FFFF).
 * Supplementary plane emojis (U+10000+) render as broken ?? characters.
 * This sanitizer replaces common ones with BMP equivalents and strips the rest.
 */

// Common supplementary → BMP replacements
const EMOJI_MAP: Record<string, string> = {
  // Faces
  '😀': '☺', '😃': '☺', '😄': '☺', '😁': '☺', '😆': '☺',
  '😅': '☺', '😂': '☺', '🤣': '☺', '😊': '☺', '🙂': '☺',
  '😉': '☺', '😍': '♥', '🥰': '♥', '😘': '♥', '😗': '☺',
  '😙': '☺', '😚': '☺', '😋': '☺', '😛': '☺', '😜': '☺',
  '🤪': '☺', '😝': '☺', '🤑': '☺', '🤗': '☺', '🤔': '☺',
  '🤭': '☺', '🤫': '☺', '🤥': '☺', '😌': '☺', '😎': '☺',
  '🤓': '☺', '🧐': '☺', '😏': '☺', '😒': '☺', '😞': '☺',
  '😔': '☺', '😟': '☺', '😕': '☺', '🙁': '☺', '😣': '☺',
  '😖': '☺', '😫': '☺', '😩': '☺', '🥺': '☺', '😢': '☺',
  '😭': '☺', '😤': '☺', '😠': '☺', '😡': '☺', '🤬': '☺',
  '😈': '☺', '👿': '☺', '🥹': '☺', '🫠': '☺', '🫡': '☺',

  // Hearts
  '💕': '♥', '💖': '♥', '💗': '♥', '💘': '♥', '💝': '♥',
  '💞': '♥', '💓': '♥', '💔': '♥', '🖤': '♥', '🤍': '♥',
  '💜': '♥', '💙': '♥', '💚': '♥', '🧡': '♥', '💛': '♥',
  '🤎': '♥', '❣': '♥', '🩷': '♥', '🩵': '♥', '🩶': '♥',

  // Fire/energy
  '🔥': '✨', '💥': '✨', '⚡': '⚡', '💫': '✨', '🌟': '⭐',

  // Hands
  '👍': '✓', '👎': '✗', '👋': '✌', '🤙': '✌', '💪': '✌',
  '🙏': '☺', '👏': '✓', '🤝': '✓', '🫶': '♥', '🤌': '☺',

  // Celebration
  '🎉': '✨', '🎊': '✨', '🥳': '☺', '💯': '✓',
  '🏆': '⭐', '🥇': '⭐', '🎯': '✓',

  // Food & drink
  '🍻': '☕', '🍺': '☕', '🍷': '☕', '🍸': '☕', '🍹': '☕',
  '🥂': '☕', '🍕': '☕', '🍔': '☕', '🎂': '☕', '🍰': '☕',
  '🥘': '☕', '🍣': '☕',

  // Nature
  '🌹': '☘', '🌸': '☘', '🌺': '☘', '🌻': '☘', '💐': '☘',
  '🌴': '☘', '🌊': '☀', '🌈': '☀',

  // Animals
  '🐶': '☺', '🐱': '☺', '🦋': '✨',

  // Travel
  '🏠': '☺', '🏖': '☀', '🗺': '✈',

  // Misc
  '📸': '☺', '🎵': '♪', '🎶': '♫', '💬': '☺', '📱': '☺',
  '💤': '☺', '🚀': '✈',
};

/**
 * Replace or strip supplementary plane emojis (codepoint > 0xFFFF)
 * that Tinder cannot render.
 */
export function sanitizeEmojis(msg: string): string {
  const result = [...msg].map(ch => {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xFFFF) return ch; // BMP — safe
    return EMOJI_MAP[ch] ?? ''; // Replace or strip
  }).join('');

  // Clean up double spaces left by stripped emojis
  return result.replace(/  +/g, ' ').trim();
}

export { EMOJI_MAP };
