'use client';
import { useParams } from 'next/navigation';
import { useState, useRef } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useResource, Waiting, money, api, Message } from '../../client';
export default function Checkout() {
  const { id } = useParams();
  const { data: p, error } = useResource('products/' + id);
  const { data: user, error: authError } = useResource('me');
  const { data: c } = useResource('config');
  const [cpf, setCpf] = useState(''),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const key = useRef('');
  async function pay(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!key.current) key.current = crypto.randomUUID();
    setBusy(true);
    setMessage('');
    try {
      const o = await api('checkout', {
        productId: id,
        idempotencyKey: key.current,
        cpf,
        acceptTerms: accepted,
      });
      location.assign('/pedido/' + o.id);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <p className="eyebrow">FINALIZAR COMPRA</p>
      <h1>Falta pouco para ler.</h1>
      {!p ? (
        <Waiting error={error} />
      ) : (
        <div className="split">
          <div className="panel stack">
            <h2>Seus dados</h2>
            {!user ? (
              <Waiting error={authError} returnTo={'/checkout/' + id} />
            ) : (
              <>
                <p>
                  Email da compra: <strong>{user.email}</strong>
                </p>
                <form className="stack" onSubmit={pay}>
                  {c && !c.salesEnabled && <Message text="As vendas ainda não estão abertas. Não é possível gerar uma cobrança neste momento." />}
                  <label>
                    CPF do pagador
                    <input
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={14}
                      required
                      placeholder="000.000.000-00"
                    />
                  </label>
                  <p className="muted">
                    Usado para criar a cobrança no provedor de pagamento.
                  </p>
                  <label className="row" htmlFor="terms">
                    <Checkbox
                      id="terms"
                      checked={accepted}
                      onCheckedChange={(v) => setAccepted(v === true)}
                      aria-label="Aceitar termos"
                    />
                    Li e aceito os{' '}
                    <a
                      className="text-link"
                      href="/termos"
                      target="_blank"
                      rel="noreferrer"
                    >
                      termos da compra
                    </a>
                    .
                  </label>
                  {c?.mode === 'test' && (
                    <Message text="Ambiente de teste: esta compra não é uma venda real." />
                  )}
                  <button
                    className="button"
                    disabled={busy || !accepted || !c?.salesEnabled}
                  >
                    {busy ? 'Gerando cobrança…' : 'Gerar Pix'}
                  </button>
                  <Message text={message} error />
                </form>
              </>
            )}
          </div>
          <aside className="panel">
            <h2>Resumo da compra</h2>
            <h3>{p.title}</h3>
            <p>Ebook em PDF · 1 unidade</p>
            <hr />
            <p className="row">
              Total <strong>{money(p.price)}</strong>
            </p>
            <p className="muted">
              O preço será conferido novamente ao gerar o pedido.
            </p>
            <p>
              Após pagar, aguarde a confirmação para acessar o download. Não é
              necessário enviar comprovante.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
