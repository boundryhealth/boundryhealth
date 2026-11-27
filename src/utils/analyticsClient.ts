export type ClientEventType =
  | 'page_view'
  | 'cluster_select'
  | 'drug_select'
  | 'filter_change'
  | 'csv_export';

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem('boundry_sid');
    if (existing) return existing;
    const generated = `sid_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    sessionStorage.setItem('boundry_sid', generated);
    return generated;
  } catch {
    return 'sid_anon';
  }
}

export function trackEvent(type: ClientEventType, target: string): void {
  try {
    const payload = JSON.stringify({
      type,
      target,
      sessionId: getSessionId(),
    });
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Non-blocking analytics
    });
  } catch {
    // Ignore client tracking failure
  }
}
