/**
 * Central selector registry for Tinder web app.
 * Mapped from actual tinder.com DOM (March 2026).
 */
export const S = {
  // --- Gamepad buttons (swipe actions) ---
  LIKE_BUTTON: 'button.gamepad-button[class*="sparks-like-default"]',
  NOPE_BUTTON: 'button.gamepad-button[class*="nope-default"]',
  SUPERLIKE_BUTTON: 'button.gamepad-button[class*="super-like-default"]',
  REWIND_BUTTON: 'button.gamepad-button[class*="rewind-default"]',
  BOOST_BUTTON: 'button.gamepad-button[class*="boost-default"]',

  // --- Card stack ---
  CARD_STACK: '[aria-label="Card stack"]',
  CARD_CONTAINER: '.recsCardboard__cardsContainer',
  CARDS: '.recsCardboard__cards',

  // --- Profile info on card ---
  PROFILE_NAME: 'span[itemprop="name"]',
  PROFILE_AGE: 'span[itemprop="age"]',
  PROFILE_DISTANCE: ':text("kilometers away"), :text("miles away")',
  PROFILE_BIO: '[class*="BreakWord"]',

  // --- Photo navigation ---
  NEXT_PHOTO: '[aria-label="Next Photo"]',
  PREV_PHOTO: '[aria-label="Previous Photo"]',
  PHOTOS_CONTAINER: '[aria-label="Photos"]',

  // --- Navigation sidebar ---
  NAV_RECS: 'a[href="/app/recs"]',
  NAV_EXPLORE: 'a[href="/app/explore"]',
  NAV_GOLD: 'a[href="/app/gold-home"]',
  NAV_MATCHES: 'a[href="/app/matches"]',
  NAV_PROFILE: 'a[href="/app/profile"]',

  // --- Auth state detection ---
  LOGGED_IN_INDICATOR: 'a[href="/app/recs"], a[href="/app/matches"]',

  // --- New Matches row (horizontal scroll, no messages yet) ---
  NEW_MATCH_ITEM: 'a.matchListItem[href*="/app/messages/"]',
  NEW_MATCH_PHOTO: 'a.matchListItem [role="img"]',

  // --- Matches/Messages tab switcher ---
  MESSAGES_TAB: 'text="Messages"',

  // --- Messages/Conversations list ---
  MESSAGE_LIST: '.messageList',
  MESSAGE_LIST_UL: 'ul[aria-label="Your recent messages"]',
  MESSAGE_LIST_ITEM: '.messageListItem',
  // The .messageListItem IS the <a> tag itself (aria-label="Name", href="/app/messages/{id}")
  MESSAGE_CONV_LINK: 'a.messageListItem[href^="/app/messages/"]',
  // Name in conversation list
  MESSAGE_CONV_NAME: '.messageListItem__name',
  // Message preview (hidden span with "Your last message was: ..." or actual text)
  MESSAGE_CONV_PREVIEW: '.messageListItem__message span.Hidden',
  // Visible preview
  MESSAGE_CONV_PREVIEW_VISIBLE: '.messageListItem__message span[aria-hidden="true"]',

  // --- Chat (inside a conversation) ---
  CHAT_CONTAINER: '.chat',
  // Input: <textarea placeholder="Type a message" maxlength="5000">
  CHAT_INPUT: 'textarea[placeholder="Type a message"]',
  // Send button: <button type="submit">
  CHAT_SEND_BUTTON: 'button[type="submit"]',
  // Message bubbles — .msg class for all bubbles, "received" in className means theirs
  CHAT_MSG_SENT: '.msg:not([class*="received"])',
  CHAT_MSG_RECEIVED: '.msg[class*="received"]',
  CHAT_MSG_ALL: '.msg',
  // Text inside a message bubble: <span class="text">
  CHAT_MSG_TEXT: 'span.text',
  // Message status (e.g. "Sent")
  CHAT_MSG_STATUS: '.msg__status',
  // Message helper wrapper
  CHAT_MSG_HELPER: '.msgHelper',
  // Received message background indicator
  CHAT_MSG_BG_RECEIVED: '.msgBackground--received',

  // --- Popups / modals ---
  MODAL_OVERLAY: '[role="dialog"]',
  MODAL_CLOSE: 'button[aria-label="Back"], button[aria-label="Close"]',
  NOT_INTERESTED: 'button:has-text("Not Interested"), button:has-text("No Thanks")',
  MAYBE_LATER: 'button:has-text("Maybe Later"), button:has-text("Not now")',
  KEEP_SWIPING: 'button:has-text("Keep Swiping")',
  ITS_A_MATCH: ':text("It\'s a Match"), :text("It\'s a match")',
};
