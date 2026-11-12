'use client';
import { useParams } from 'next/navigation';
import { useResource, Waiting, money } from '../../client';
export default function Detail() {
  const { id } = useParams();
  const { data: p, error } = useResource('products/' + id);
  const { data: c } = useResource('config');
  return (
    <div className="page">
      <a className="text-link" href="/catalogo">
        ← Voltar ao catálogo
      </a>
      {!p ? (
        <Waiting error={error} />
      ) : (
        <div className="split section">
          <img
            className="cover"
            src={'/api/covers/' + p.cover_id}
            alt={'Capa de ' + p.title}
          />
          <div>
            <p className="eyebrow">EBOOK · PDF</p>
            <h1>{p.title}</h1>
            <p style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p>
            <h2>{money(p.price)}</h2>
            <p className="muted">
              Pagamento único por Pix. Acesso após confirmação.
            </p>
            {c?.salesEnabled ? (
              <a className="button" href={'/checkout/' + p.id}>
                Comprar ebook ↗
              </a>
            ) : (
              <p className="message">Vendas ainda não disponíveis.</p>
            )}
            <p>
              O arquivo ficará disponível na sua biblioteca. Uma conta com email
              verificado é necessária.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
