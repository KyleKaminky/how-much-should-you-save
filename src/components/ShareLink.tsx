import { useEffect, useState } from 'react';
import { shareUrl } from '../lib/urlState';
import type { Inputs } from '../lib/types';

/**
 * The address bar already carries the scenario, but nobody thinks to look there.
 * An explicit button is what makes the tool shareable in practice.
 */
export function ShareLink({ inputs }: { inputs: Inputs }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    const url = shareUrl(inputs);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard API needs a secure context and can be blocked outright.
      // Selecting the text is the honest fallback.
      window.prompt('Copy this link:', url);
    }
  };

  return (
    <div className="share">
      <span className="share-text">
        Every number here is in the address bar — copy the link to save this scenario or send it to
        someone.
      </span>
      <button type="button" className="share-button" onClick={copy}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
