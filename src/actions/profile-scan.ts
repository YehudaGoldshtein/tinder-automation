import { Page } from 'playwright';
import { S } from '../selectors';
import { dismissPopups } from './popups';
import { readMessages } from './messages';
import logger from '../utils/logger';

export interface ProfileScan {
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
  messages: { from: string; text: string; time: string }[];
}

/** Get conversation messages with full detail */
async function getConversationMessages(page: Page): Promise<ProfileScan['messages']> {
  const msgs = await readMessages(page);
  return msgs.map(m => ({
    from: m.from,
    text: m.text,
    time: m.time,
  }));
}

/** Click the profile header in a conversation to expand the full profile view */
async function openProfileFromConversation(page: Page): Promise<boolean> {
  try {
    // The profile photo/name area at the top of the conversation is clickable
    const profileHeader = page.locator('.chatAvatar, [aria-label*="photos"]').first();
    if (await profileHeader.isVisible({ timeout: 2000 })) {
      await profileHeader.click();
      await page.waitForTimeout(2000);
      return true;
    }
    // Fallback: click the name at the top
    const nameHeader = page.locator('.chat a[href*="/app/messages/"]').first();
    if (await nameHeader.isVisible({ timeout: 1000 })) {
      await nameHeader.click();
      await page.waitForTimeout(2000);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Extract profile data from the expanded profile view */
async function scrapeProfileData(page: Page): Promise<Partial<ProfileScan>> {
  return await page.evaluate(() => {
    const result: Record<string, any> = {};

    // Name + Age from aria-label like "Azul 32 years"
    const nameLabel = document.querySelector('[aria-label*="years"]');
    if (nameLabel) {
      const match = nameLabel.getAttribute('aria-label')?.match(/^(.+?)\s+(\d+)\s+years?$/);
      if (match) {
        result.name = match[1].trim();
        result.age = match[2];
      }
    }

    // Distance
    const allText = document.body.innerText;
    const distMatch = allText.match(/(\d+)\s*kilometer/);
    if (distMatch) result.distance = `${distMatch[1]} kilometers away`;

    // Photos - all high-res URLs
    const photos: string[] = [];
    document.querySelectorAll('[style*="images-ssl.gotinder.com"]').forEach(el => {
      const style = el.getAttribute('style') || '';
      const urlMatch = style.match(/images-ssl\.gotinder\.com\/[^"&)\\]+/);
      if (urlMatch) {
        // Use high-res version (640x800) and dedupe
        const url = `https://${urlMatch[0]}`.replace(/172x216/, '640x800');
        if (!photos.some(p => p.includes(url.split('/').pop()!.split('_').pop()!.split('.')[0]))) {
          photos.push(url);
        }
      }
    });
    // Also check <img> tags
    document.querySelectorAll('img[src*="images-ssl.gotinder.com"]').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (!photos.includes(src)) photos.push(src);
    });
    result.photos = photos;

    // Looking for
    const lookingForH2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent?.includes('Looking for'));
    if (lookingForH2) {
      const container = lookingForH2.closest('div')?.parentElement;
      const text = container?.querySelector('[class*="display-3-strong"]')?.textContent;
      if (text) result.lookingFor = text.trim();
    }

    // Bio/About - text that appears before the sections
    const bioEl = document.querySelector('[class*="BreakWord"]');
    if (bioEl) result.bio = bioEl.textContent?.trim() || '';

    // Extract section data (Essentials, Lifestyle, Basics)
    function extractSection(sectionName: string): Record<string, string> {
      const data: Record<string, string> = {};
      const h2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent?.includes(sectionName));
      if (!h2) return data;
      const section = h2.closest('div')?.parentElement;
      if (!section) return data;
      const h3s = section.querySelectorAll('h3');
      h3s.forEach(h3 => {
        const key = h3.textContent?.trim() || '';
        const valueEl = h3.closest('li')?.querySelector('[class*="body-1-regular"][class*="text-primary"]');
        const value = valueEl?.textContent?.trim() || '';
        if (key && value) data[key] = value;
      });
      return data;
    }

    result.essentials = extractSection('Essentials');
    result.lifestyle = extractSection('Lifestyle');
    result.basics = extractSection('Basics');

    // Interests
    const interests: string[] = [];
    const interestsH2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent?.includes('Interests'));
    if (interestsH2) {
      const section = interestsH2.closest('div')?.parentElement;
      section?.querySelectorAll('[class*="passions-shared"], [class*="passions-default"]').forEach(el => {
        const text = el.textContent?.trim();
        if (text) interests.push(text);
      });
    }
    result.interests = interests;

    return result;
  });
}

/**
 * Full profile scan: opens profile from a conversation, extracts all data + messages.
 * Page should already be on a conversation (/app/messages/{id}).
 */
export async function scanProfile(page: Page): Promise<ProfileScan> {
  await dismissPopups(page);

  // 1. Read messages first (while we're in the conversation view)
  const messages = await getConversationMessages(page);

  // 2. Open the profile view
  const profileOpened = await openProfileFromConversation(page);

  let profileData: Partial<ProfileScan> = {};
  if (profileOpened) {
    // 3. Scrape profile data
    profileData = await scrapeProfileData(page);

    // 4. Go back to conversation
    const backBtn = page.locator('[data-testid="profileBackButton"], button[aria-label="Back"]').first();
    if (await backBtn.isVisible({ timeout: 2000 })) {
      await backBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  return {
    name: profileData.name || '',
    age: profileData.age || '',
    distance: profileData.distance || '',
    bio: profileData.bio || '',
    lookingFor: profileData.lookingFor || '',
    photos: profileData.photos || [],
    essentials: profileData.essentials || {},
    lifestyle: profileData.lifestyle || {},
    basics: profileData.basics || {},
    interests: profileData.interests || [],
    messages,
  };
}
