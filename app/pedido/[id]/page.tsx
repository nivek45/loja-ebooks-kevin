'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  useResource,
  Waiting,
  Message,
  money,
  date,
  statuses,
  api,
} from '../../client';
export default function Order() {
  const { id } = useParams();
  const { data: o, setData, error } = useResource('orders/' + id);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const r = await api('orders/' + id + '/reconcile', {});
      setData((previous: any) => ({ ...previous, ...r }));
      setMessage('Status consultado.');
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (o?.status !== 'pending') return;
    const timer = setInterval(() => {
      api('orders/' + id)
        .then(setData)
        .catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [id, o?.status, setData]);
  async function getFile() {
    setBusy(true);
    try {
      const d = await api('orders/' + id + '/download', {});
      location.assign(d.url);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page narrow">
      <h1>Seu pedido</h1>
      {!o ? (
        <Waiting error={error} returnTo={'/pedido/' + id} />
      ) : (
        <div className="panel stack">
          <span className="badge">{statuses[o.status]}</span>
          <h2>{o.title}</h2>
          <p className="muted order-id">Pedido: {o.id}</p>
          <strong>{money(o.amount)}</strong>
          {o.mode === 'test' && (
            <Message text="Pedido de teste. Não representa uma venda real." />
          )}
          {o.status === 'pending' && (
            <>
              {o.qrImage && (
                <img
                  className="qr"
                  src={'data:image/png;base64,' + o.qrImage}
                  alt="QR Code Pix deste pedido"
                />
              )}
              <p>Válido até {date(o.expiresAt)}.</p>
              {o.qrCode ? (
                <>
                  <label>
                    Pix Copia e Cola
                    <textarea readOnly value={o.qrCode} />
                  </label>
                  <button
                    className="button"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(o.qrCode)
                        .then(() => setMessage('Código copiado.'))
                        .catch(() =>
                          setMessage('Selecione e copie o código acima.'),
                        )
                    }
                  >
                    Copiar código Pix
                  </button>
                </>
              ) : (
                <p>
                  A cobrança ainda não foi concluída. Use Consultar pagamento
                  para tentar novamente.
                </p>
              )}
              <p className="muted">
                Pague no aplicativo do seu banco. O download só será liberado
                após a confirmação do provedor.
              </p>
            </>
          )}
          {o.status === 'approved' && (
            <button disabled={busy} className="button" onClick={getFile}>
              Baixar meu ebook
            </button>
          )}
          {o.status === 'refunded' && (
            <p>O acesso a novos downloads foi encerrado após o reembolso.</p>
          )}
          {['expired', 'cancelled'].includes(o.status) && (
            <p>
              Este Pix não está disponível para pagamento. Consulte o status se
              você já pagou, ou volte ao catálogo para uma nova compra.
            </p>
          )}
          <button disabled={busy} className="button secondary" onClick={check}>
            {busy ? 'Aguarde…' : 'Consultar pagamento'}
          </button>
          <a className="text-link" href="/biblioteca">
            Ir para Meus ebooks
          </a>
          <Message text={message} />
        </div>
      )}
    </div>
  );
}
