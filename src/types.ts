export interface Config {
  user: {
    name: string;
    phone: string;
  };
  browser: {
    headless: boolean;
    userDataDir: string;
    slowMo: number;
    viewport: { width: number; height: number };
  };
  swipe: {
    dailyLimit: number;
    likeRatio: number;
    delayBetweenSwipes: { min: number; max: number };
    longPauseChance: number;
    longPauseRange: { min: number; max: number };
  };
  messages: {
    openers: string[];
    followUp: {
      staleAfterHours: number;
      templates: string[];
    };
    maxNewOpeners: number;
  };
  logging: {
    level: string;
    file: string;
  };
}

export interface Profile {
  name: string;
  age: string;
  bio: string;
  distance: string;
}

export interface Match {
  id: string;
  name: string;
  lastMessage: string;
  lastMessageTime: string;
  matchedAt: string;
  isNew: boolean;
  hasOpener: boolean;
}

export interface Message {
  from: 'me' | 'them';
  text: string;
  time: string;
}

export interface DailyStats {
  date: string;
  swipes: number;
  likes: number;
  passes: number;
  newMatches: number;
  openersSent: number;
  followUpsSent: number;
}

export interface AppState {
  swipedProfiles: string[];
  contactedMatches: string[];
  stats: DailyStats[];
}
