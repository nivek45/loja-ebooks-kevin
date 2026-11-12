'use client';
import { ArrowUpRight, BookOpen, Library, ShieldCheck } from 'lucide-react';
import { useResource, BookCard, Waiting } from './client';
export default function Home() {
  const { data, error } = useResource('products');
  const first = data?.products?.[0];
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">SUA PRÓXIMA BOA LEITURA</p>
          <h1>
            Novas ideias.
            <br />
            No seu ritmo.
          </h1>
          <p className="lead">
            Ebooks para abrir caminhos, descobrir perspectivas e levar boas
            ideias com você.
          </p>
          <a className="button" href="/catalogo">
            Explorar ebooks <ArrowUpRight size={20} />
          </a>
        </div>
        <div style={{ justifySelf: 'center' }}>
          <img
            className="hero-cover"
            src={first ? '/api/covers/' + first.cover_id : '/capa-exemplo.png'}
            alt={
              first
                ? 'Capa de ' + first.title
                : 'Capa demonstrativa: O Essencial'
            }
          />
          {!first && (
            <p
              className="muted"
              style={{ marginTop: '2rem', fontSize: '.875rem' }}
            >
              Capa de exemplo · Não disponível para compra
            </p>
          )}
        </div>
      </section>
      <section className="section">
        <div className="section-title">
          <div>
            <p className="eyebrow">CATÁLOGO</p>
            <h2>Encontre sua próxima leitura</h2>
          </div>
          <a href="/catalogo">
            Ver catálogo <ArrowUpRight size={18} />
          </a>
        </div>
        {!data ? <Waiting error={error} /> : data.products.length ? (
          <div className="grid">
            {data.products.slice(0, 3).map((p: any) => (
              <BookCard p={p} key={p.id} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <BookOpen />
            <h3>Os primeiros ebooks estão chegando</h3>
            <p>Nenhum ebook está à venda neste momento.</p>
          </div>
        )}
      </section>
      <section className="benefits">
        <div>
          <BookOpen />
          <h3>Leitura que acompanha você</h3>
          <p>Arquivos digitais para ler onde preferir.</p>
        </div>
        <div>
          <ShieldCheck />
          <h3>Pagamento por Pix</h3>
          <p>
            Pague com o aplicativo do seu banco quando as vendas estiverem
            abertas.
          </p>
        </div>
        <div>
          <Library />
          <h3>Sua biblioteca pessoal</h3>
          <p>Acesse suas compras em Meus ebooks.</p>
        </div>
      </section>
    </>
  );
}
