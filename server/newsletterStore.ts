import fs from 'fs';
import path from 'path';

export type NewsletterTrack = 'jobs' | 'nice-nhs' | 'both';

export interface NewsletterSubscriber {
  email: string;
  track: NewsletterTrack;
  subscribedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'newsletter-subscribers.json');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VALID_TRACKS = new Set<NewsletterTrack>(['jobs', 'nice-nhs', 'both']);

function readSubscribers(): NewsletterSubscriber[] {
  try {
    if (!fs.existsSync(SUBSCRIBERS_FILE)) return [];
    const raw = fs.readFileSync(SUBSCRIBERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NewsletterSubscriber[]) : [];
  } catch {
    return [];
  }
}

function writeSubscribers(list: NewsletterSubscriber[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(list, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export function subscribeNewsletter(
  rawEmail: unknown,
  rawTrack: unknown
): { ok: boolean; alreadySubscribed?: boolean; error?: string } {
  const email = String(rawEmail ?? '').trim().toLowerCase().slice(0, 160);
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  const track: NewsletterTrack = VALID_TRACKS.has(rawTrack as NewsletterTrack)
    ? (rawTrack as NewsletterTrack)
    : 'both';

  const list = readSubscribers();
  const existing = list.find((s) => s.email === email);
  if (existing) {
    existing.track = track;
    writeSubscribers(list);
    return { ok: true, alreadySubscribed: true };
  }

  list.push({
    email,
    track,
    subscribedAt: new Date().toISOString(),
  });
  writeSubscribers(list);
  return { ok: true, alreadySubscribed: false };
}

export function getNewsletterSummary(): {
  totalSubscribers: number;
  byTrack: Record<NewsletterTrack, number>;
  subscribers: NewsletterSubscriber[];
} {
  const list = readSubscribers();
  const byTrack: Record<NewsletterTrack, number> = {
    jobs: 0,
    'nice-nhs': 0,
    both: 0,
  };
  for (const sub of list) {
    if (byTrack[sub.track] !== undefined) {
      byTrack[sub.track] += 1;
    }
  }
  return {
    totalSubscribers: list.length,
    byTrack,
    subscribers: [...list].reverse(),
  };
}
