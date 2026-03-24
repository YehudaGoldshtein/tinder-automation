import fs from 'fs';
import path from 'path';

const PROFILES_PATH = path.resolve(__dirname, '..', 'data', 'profiles', '_all_profiles.json');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'analysis.json');

interface Message {
  from: 'me' | 'them';
  text: string;
  time: string;
}

interface Profile {
  name: string;
  age: string;
  distance: string;
  bio: string;
  lookingFor: string;
  photos: string[];
  essentials: Record<string, string>;
  lifestyle: Record<string, string>;
  basics: Record<string, string>;
  interests: string[];
  messages: Message[];
  matchId: string;
  conversationUrl: string;
}

type Outcome = 'got_number' | 'asked_whatsapp' | 'active' | 'no_reply' | 'stale' | 'unopened' | 'rejected';

interface LabeledConversation {
  name: string;
  matchId: string;
  url: string;
  age: string;
  distance: string;
  lookingFor: string;
  interests: string[];
  outcome: Outcome;
  messageCount: number;
  myMessageCount: number;
  theirMessageCount: number;
  lastFrom: 'me' | 'them' | 'none';
  opener: string;
  openerType: string;
  theyRepliedToOpener: boolean;
  transitionMessage: string;  // the message where you ask for WA/number/meetup
  phoneNumber: string;        // extracted number if any
  messages: Message[];
}

function extractPhoneNumber(text: string): string {
  // Match patterns like +595972929100, 0983814271, +54 9 3718 44 5353, +972504265054
  const patterns = [
    /(\+\d{1,3}\s?\d[\d\s-]{7,})/,
    /(0\d{9,})/,
    /(\d{10,})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return '';
}

function classifyOpener(text: string): string {
  const t = text.toLowerCase();
  if (/hol[ia]|hey|hi$|hello/i.test(t)) return 'simple_greeting';
  if (/guap[ao]|lind[ao]|hermos[ao]|bonit[ao]|sexy|hot/i.test(t)) return 'compliment_appearance';
  if (/sonrisa|ojos|foto|smile|eyes/i.test(t)) return 'compliment_specific';
  if (/\?/.test(t)) return 'question';
  if (/😘|😍|❤|🔥/.test(t)) return 'flirty_emoji';
  return 'other';
}

function labelConversation(p: Profile): LabeledConversation {
  const msgs = p.messages || [];
  const allText = msgs.map(m => m.text).join(' ');
  const allTextLower = allText.toLowerCase();

  // Extract phone number from any message
  let phoneNumber = '';
  for (const msg of msgs) {
    const num = extractPhoneNumber(msg.text);
    if (num) { phoneNumber = num; break; }
  }

  const hasWhatsappMention = allTextLower.includes('whatsapp') || allTextLower.includes('whapp');
  const hasNumber = phoneNumber.length > 0;

  // Count messages
  const myMsgs = msgs.filter(m => m.from === 'me');
  const theirMsgs = msgs.filter(m => m.from === 'them');
  const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

  // Detect rejection
  const rejectionPatterns = /no gracias|no estoy interesad|no me interesa|no busco|dejame en paz|no thanks|not interested/i;
  const hasRejection = msgs.some(m => m.from === 'them' && rejectionPatterns.test(m.text));

  // Determine outcome
  let outcome: Outcome;
  if (msgs.length === 0) {
    outcome = 'unopened';
  } else if (hasRejection) {
    outcome = 'rejected';
  } else if (hasNumber) {
    outcome = 'got_number';
  } else if (hasWhatsappMention && !hasNumber) {
    outcome = 'asked_whatsapp';
  } else if (theirMsgs.length === 0) {
    outcome = 'no_reply';
  } else if (lastMsg && lastMsg.from === 'them') {
    outcome = 'active';
  } else {
    outcome = 'stale';
  }

  // Find opener (first message from me)
  const opener = myMsgs.length > 0 ? myMsgs[0].text : '';

  // Find transition message (where I ask for WA/number/meetup)
  let transitionMessage = '';
  for (const msg of myMsgs) {
    const t = msg.text.toLowerCase();
    if (t.includes('whatsapp') || t.includes('whapp') || t.includes('número') || t.includes('numero') ||
        t.includes('number') || /salimos|quedar|encontrar|meet|salir|cita|date/i.test(t)) {
      transitionMessage = msg.text;
      break;
    }
  }

  // Did they reply to opener?
  const theyRepliedToOpener = msgs.length >= 2 && msgs[0].from === 'me' && msgs.some(m => m.from === 'them');

  return {
    name: p.name,
    matchId: p.matchId,
    url: p.conversationUrl,
    age: p.age,
    distance: p.distance,
    lookingFor: p.lookingFor,
    interests: p.interests || [],
    outcome,
    messageCount: msgs.length,
    myMessageCount: myMsgs.length,
    theirMessageCount: theirMsgs.length,
    lastFrom: lastMsg ? lastMsg.from : 'none',
    opener,
    openerType: classifyOpener(opener),
    theyRepliedToOpener,
    transitionMessage,
    phoneNumber,
    messages: msgs,
  };
}

function generateInsights(labeled: LabeledConversation[]) {
  const insights: any = {};

  // --- Outcome distribution ---
  const outcomes: Record<string, number> = {};
  labeled.forEach(c => { outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1; });
  insights.outcomeDistribution = outcomes;

  // --- Opener effectiveness ---
  const openerStats: Record<string, { total: number; replied: number; gotNumber: number }> = {};
  labeled.filter(c => c.opener).forEach(c => {
    if (!openerStats[c.openerType]) openerStats[c.openerType] = { total: 0, replied: 0, gotNumber: 0 };
    openerStats[c.openerType].total++;
    if (c.theyRepliedToOpener) openerStats[c.openerType].replied++;
    if (c.outcome === 'got_number') openerStats[c.openerType].gotNumber++;
  });
  // Calculate rates
  insights.openerEffectiveness = Object.entries(openerStats).map(([type, s]) => ({
    type,
    total: s.total,
    replyRate: Math.round((s.replied / s.total) * 100) + '%',
    numberRate: Math.round((s.gotNumber / s.total) * 100) + '%',
  })).sort((a, b) => b.total - a.total);

  // --- Messages before number exchange ---
  const gotNumber = labeled.filter(c => c.outcome === 'got_number');
  const msgsBeforeNumber = gotNumber.map(c => c.messageCount);
  insights.messagesBeforeNumber = {
    count: gotNumber.length,
    avg: Math.round(msgsBeforeNumber.reduce((a, b) => a + b, 0) / msgsBeforeNumber.length),
    min: Math.min(...msgsBeforeNumber),
    max: Math.max(...msgsBeforeNumber),
    median: msgsBeforeNumber.sort((a, b) => a - b)[Math.floor(msgsBeforeNumber.length / 2)],
  };

  // --- Successful openers (led to number) ---
  insights.successfulOpeners = gotNumber.map(c => ({
    name: c.name,
    opener: c.opener,
    openerType: c.openerType,
    msgCount: c.messageCount,
    transitionMessage: c.transitionMessage,
  }));

  // --- Stale conversation analysis ---
  const stale = labeled.filter(c => c.outcome === 'stale');
  insights.staleAnalysis = {
    count: stale.length,
    avgMessages: Math.round(stale.reduce((a, c) => a + c.messageCount, 0) / (stale.length || 1)),
    lastMessages: stale.map(c => ({
      name: c.name,
      lastMsg: c.messages[c.messages.length - 1]?.text.slice(0, 80),
      msgCount: c.messageCount,
    })),
  };

  // --- No reply analysis ---
  const noReply = labeled.filter(c => c.outcome === 'no_reply');
  insights.noReplyOpeners = noReply.map(c => ({
    name: c.name,
    opener: c.opener,
    openerType: c.openerType,
  }));

  // --- Active conversations (they replied last — opportunities) ---
  const active = labeled.filter(c => c.outcome === 'active');
  insights.activeOpportunities = active.map(c => ({
    name: c.name,
    lastMsg: c.messages[c.messages.length - 1]?.text.slice(0, 80),
    msgCount: c.messageCount,
    url: c.url,
  }));

  // --- Transition messages that worked ---
  insights.workingTransitions = gotNumber
    .filter(c => c.transitionMessage)
    .map(c => ({ name: c.name, transition: c.transitionMessage, msgsBeforeTransition: c.messageCount }));

  // --- Conversation length distribution ---
  const lengthBuckets: Record<string, number> = { '0': 0, '1': 0, '2-5': 0, '6-15': 0, '16-30': 0, '31+': 0 };
  labeled.forEach(c => {
    const n = c.messageCount;
    if (n === 0) lengthBuckets['0']++;
    else if (n === 1) lengthBuckets['1']++;
    else if (n <= 5) lengthBuckets['2-5']++;
    else if (n <= 15) lengthBuckets['6-15']++;
    else if (n <= 30) lengthBuckets['16-30']++;
    else lengthBuckets['31+']++;
  });
  insights.conversationLengthDistribution = lengthBuckets;

  return insights;
}

// --- Main ---
const profiles: Profile[] = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf-8'));
const labeled = profiles.map(labelConversation);
const insights = generateInsights(labeled);

// Save labeled data
const output = { labeled, insights };
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

// Print summary
console.log('\n========================================');
console.log('  TINDER CONVERSATION ANALYSIS');
console.log('========================================\n');

console.log('OUTCOMES:');
Object.entries(insights.outcomeDistribution).sort((a: any, b: any) => b[1] - a[1]).forEach(([k, v]) => {
  console.log(`  ${k.padEnd(16)} ${v}`);
});

console.log('\nOPENER EFFECTIVENESS:');
insights.openerEffectiveness.forEach((o: any) => {
  console.log(`  ${o.type.padEnd(22)} ${String(o.total).padStart(3)} sent  ${o.replyRate.padStart(4)} reply  ${o.numberRate.padStart(4)} → number`);
});

console.log('\nMESSAGES BEFORE NUMBER EXCHANGE:');
const mbn = insights.messagesBeforeNumber;
console.log(`  Avg: ${mbn.avg}  Min: ${mbn.min}  Max: ${mbn.max}  Median: ${mbn.median}`);

console.log('\nSUCCESSFUL OPENERS (led to number):');
insights.successfulOpeners.forEach((o: any) => {
  console.log(`  ${o.name.padEnd(20)} [${o.openerType}] "${o.opener.slice(0, 60)}"`);
});

console.log('\nWORKING TRANSITION MESSAGES:');
insights.workingTransitions.forEach((t: any) => {
  console.log(`  ${t.name.padEnd(20)} (msg ${t.msgsBeforeTransition}) "${t.transition.slice(0, 70)}"`);
});

console.log('\nACTIVE OPPORTUNITIES (they replied last):');
insights.activeOpportunities.forEach((a: any) => {
  console.log(`  ${a.name.padEnd(20)} ${String(a.msgCount).padStart(3)} msgs  "${a.lastMsg}"`);
});

console.log('\nCONVERSATION LENGTH DISTRIBUTION:');
Object.entries(insights.conversationLengthDistribution).forEach(([k, v]) => {
  const bar = '█'.repeat(v as number);
  console.log(`  ${k.padEnd(6)} ${String(v).padStart(3)} ${bar}`);
});

console.log('\nNO-REPLY OPENERS (what didn\'t work):');
insights.noReplyOpeners.forEach((o: any) => {
  console.log(`  [${o.openerType}] "${o.opener.slice(0, 70)}"`);
});

console.log(`\nFull analysis saved to: ${OUTPUT_PATH}`);
