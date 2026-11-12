'use client';
import { useState } from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import { useResource, Waiting, money, statuses, WebTools } from '../client';
export default function Library() {
  const [page, setPage] = useState(1);
  const { data, error } = useResource('orders?page=' + page);
  return (
    <div className="page">
      <WebTools />
      <p className="eyebrow">SUA BIBLIOTECA</p>
      <h1>Meus ebooks</h1>
      <p className="lead">Suas leituras e o andamento das suas compras.</p>
      {!data ? (
        <Waiting error={error} returnTo="/biblioteca" />
      ) : data.orders.length ? (
        <div className="grid">
          {data.orders.map((o: any) => (
            <article className="panel" key={o.id}>
              <span className="badge">{statuses[o.status]}</span>
              <h2>{o.title}</h2>
              <p>
                {money(o.amount)}
                {o.mode === 'test' ? ' · Teste' : ''}
              </p>
              <a className="button" href={'/pedido/' + o.id}>
                {o.status === 'approved' ? 'Acessar ebook' : 'Ver pedido'}
              </a>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>Sua biblioteca começa com uma boa leitura</h2>
          <p>Você ainda não possui pedidos.</p>
          <a className="button" href="/catalogo">
            Explorar ebooks
          </a>
        </div>
      )}
      {data && (page > 1 || data.hasMore) && (
        <Pagination aria-label="Páginas de pedidos">
          <PaginationContent>
            {page > 1 && (
              <PaginationItem>
                <PaginationLink
                  href="#conteudo"
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </PaginationLink>
              </PaginationItem>
            )}
            <PaginationItem>
              <span>Página {page}</span>
            </PaginationItem>
            {data.hasMore && (
              <PaginationItem>
                <PaginationLink
                  href="#conteudo"
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </PaginationLink>
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
