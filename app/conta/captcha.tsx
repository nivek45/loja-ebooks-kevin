'use client';
import { useEffect, useRef, useState } from 'react';

type Turnstile = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }
let loading: Promise<void> | undefined;
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!loading) loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const timer = setTimeout(() => { script.remove(); reject(new Error('timeout')); }, 15000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('load')); };
    document.head.appendChild(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

// Supabase, configured with the matching secret, is the verifier of this token.
export function Captcha({ siteKey }: { siteKey: string }) {
  const element = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false, widget: string | undefined;
    load().then(() => {
      if (stopped || !element.current) return;
      if (!window.turnstile) throw new Error('unavailable');
      widget = window.turnstile.render(element.current, {
        sitekey: siteKey, language: 'pt-br', size: 'flexible', 'response-field': false,
        callback: (value: string) => { if (!stopped) { setToken(value); setError(false); } },
        'expired-callback': () => { if (!stopped) setToken(''); },
        'error-callback': () => { if (!stopped) { setToken(''); setError(true); } },
      });
    }).catch(() => { if (!stopped) setError(true); });
    return () => { stopped = true; if (widget !== undefined) window.turnstile?.remove(widget); };
  }, [siteKey]);
  return <div>
    <div ref={element} aria-label="Verificação de segurança" />
    <input type="hidden" name="captchaToken" value={token} />
    {error && <p role="alert">Não foi possível carregar a verificação. Recarregue a página e tente novamente.</p>}
  </div>;
}
