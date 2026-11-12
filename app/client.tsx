'use client';
// Recursos usados pelas páginas: chamadas à API, carregamento, mensagens e cartões.
import { useCallback, useEffect, useState } from 'react';
export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100,
  );
export const date = (ms: number) => new Date(ms).toLocaleString('pt-BR');
export const statuses: Record<string, string> = {
  pending: 'Aguardando pagamento',
  approved: 'Pagamento aprovado',
  expired: 'Pix expirado',
  cancelled: 'Pagamento cancelado',
  refunded: 'Pagamento reembolsado',
};
let refreshing: Promise<Response> | null = null;
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function accountLink(returnTo: string) {
  return '/conta?next=' + encodeURIComponent(returnTo);
}
export function safeReturnTo(value: string | null) {
  return value && /^\/(?:checkout|pedido)\/[0-9a-f-]{36}$|^\/(?:biblioteca|admin)$/.test(value)
    ? value : '';
}
export async function api(
  path: string,
  input?: unknown,
  init: RequestInit = {},
) {
  const options: RequestInit = {
    credentials: 'same-origin',
    ...init,
    ...(input !== undefined
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      : {}),
  };
  const send = async () => {
    try { return await fetch('/api/' + path, options); }
    catch { throw new ApiError('Não foi possível conectar. Confira sua conexão e tente novamente.', 0); }
  };
  let r = await send();
  if (r.status === 401 && !path.startsWith('auth/')) {
    refreshing ??= fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).finally(() => { refreshing = null; });
    const refresh = await refreshing.catch(() => null);
    if (refresh?.ok) r = await send();
  }
  const data: any = await r.json().catch(() => null);
  if (!r.ok || !data) throw new ApiError(data?.error || 'O serviço não respondeu como esperado. Tente novamente.', r.status);
  return data;
}
export function useResource(path: string, enabled = true) {
  const [state, setState] = useState<{path: string; data: any; error: string}>({path, data: null, error: ''});
  const setData = useCallback((update: any) => setState(previous => ({path, error: '', data: typeof update === 'function' ? update(previous.path === path ? previous.data : null) : update})), [path]);
  useEffect(() => {
    let active = true;
    if (!enabled) return;
    api(path)
      .then((d) => {
        if (active) setState({path, data: d, error: ''});
      })
      .catch((e) => {
        if (active) setState({path, data: null, error: e.message});
      });
    return () => {
      active = false;
    };
  }, [path, enabled]);
  return { data: enabled && state.path === path ? state.data : null, setData, error: enabled && state.path === path ? state.error : '' };
}
export function Message({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return text ? (
    <p
      className={'message ' + (error ? 'error' : '')}
      role={error ? 'alert' : 'status'}
    >
      {text}
    </p>
  ) : null;
}
export function Waiting({ error, returnTo }: { error: string; returnTo?: string }) {
  return error ? (
    <div className="panel">
      <Message text={error} error />
      <button className="text-link" onClick={() => location.reload()}>Tentar novamente</button>
      {returnTo && <p><a className="text-link" href={accountLink(returnTo)}>Acessar minha conta</a></p>}
    </div>
  ) : (
    <output>Carregando…</output>
  );
}
export function BookCard({ p }: { p: any }) {
  return (
    <a className="book-card" href={'/ebook/' + p.id}>
      <img src={'/api/covers/' + p.cover_id} alt={'Capa de ' + p.title} />
      <h3>{p.title}</h3>
      <p className="muted">
        {p.description.slice(0, 110)}
        {p.description.length > 110 ? '…' : ''}
      </p>
      <span className="price">{money(p.price)}</span>
      <p className="text-link">Conhecer ebook ↗</p>
    </a>
  );
}
export function WebTools() {
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        ctx.registerTool(
          {
            name: 'consultar_meus_pedidos',
            description:
              'Consulta os pedidos da conta autenticada. Não cria cobranças nem libera pagamentos.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
            async execute(input: any) {
              if (
                !input ||
                typeof input !== 'object' ||
                Object.keys(input).length
              )
                throw new Error('Informe um objeto vazio.');
              return api('orders');
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, []);
  return null;
}
