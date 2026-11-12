'use client';
import { useResource, BookCard, Waiting } from '../client';
export default function Catalog() {
  const { data, error } = useResource('products');
  return (
    <div className="page">
      <p className="eyebrow">EXPLORE A BIBLIOTECA</p>
      <h1>Ebooks</h1>
      <p className="lead">Escolha uma leitura para o seu próximo passo.</p>
      {!data ? (
        <Waiting error={error} />
      ) : data.products.length ? (
        <div className="grid">
          {data.products.map((p: any) => (
            <BookCard p={p} key={p.id} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>Novas leituras em breve</h2>
          <p>Nenhum ebook está à venda neste momento.</p>
          <p className="muted">
            A capa da página inicial é apenas um exemplo visual.
          </p>
        </div>
      )}
    </div>
  );
}
