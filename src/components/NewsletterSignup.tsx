import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { NewsletterTrack } from '../../server/newsletterStore';

export const NewsletterSignup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [track, setTrack] = useState<NewsletterTrack>('both');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, track }),
      });
      const json = (await res.json()) as { ok?: boolean; alreadySubscribed?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setStatusMessage({ type: 'error', text: json.error || 'Could not subscribe right now.' });
        return;
      }
      setEmail('');
      setStatusMessage({
        type: 'success',
        text: json.alreadySubscribed
          ? 'Preferences updated. You are subscribed to Boundry UK updates.'
          : 'Subscribed. Weekly UK graduate & biotech role digests arrive every Monday.',
      });
    } catch {
      setStatusMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="border-t border-[#E5E3DC] bg-[#F3F2EE]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="max-w-xl">
          <h2 className="text-base font-semibold text-[#1C1B18]">
            Boundry UK Weekly Job & NHS Access Brief
          </h2>
          <p className="mt-1 text-xs text-[#57544D] leading-relaxed">
            Built for UK life science students, graduates, and job applicants. Get new entry-level biotech openings, salary benchmarks, and monthly NICE-to-NHS commercial takeaways in one concise email.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            aria-label="Newsletter digest focus"
            value={track}
            onChange={(e) => setTrack(e.target.value as NewsletterTrack)}
            className="px-3 py-2 text-xs font-medium bg-white border border-[#D6D3CB] rounded-md text-[#1C1B18] focus:outline-none focus:border-[#1E40AF] cursor-pointer"
          >
            <option value="both">Jobs + NICE-to-NHS</option>
            <option value="jobs">Graduate & Biotech Jobs</option>
            <option value="nice-nhs">NICE-to-NHS Brief</option>
          </select>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@university.ac.uk or email"
            className="sm:w-64 px-3 py-2 text-xs bg-white border border-[#D6D3CB] rounded-md text-[#1C1B18] placeholder:text-[#78756E] focus:outline-none focus:ring-2 focus:ring-[#1E40AF]/20 focus:border-[#1E40AF]"
          />

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-xs font-medium bg-[#1E40AF] text-white rounded-md hover:bg-[#1D4ED8] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {submitting ? 'Subscribing...' : 'Subscribe Free'}
          </button>
        </form>
      </div>

      {statusMessage && (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pb-6 -mt-2">
          <div
            className={`inline-flex items-center gap-2 text-xs px-3 py-2 rounded-md border ${
              statusMessage.type === 'success'
                ? 'bg-white border-[#BBF7D0] text-[#15803D]'
                : 'bg-white border-[#FECACA] text-[#B91C1C]'
            }`}
          >
            {statusMessage.type === 'success' && <Check className="w-4 h-4 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
        </div>
      )}
    </section>
  );
};
