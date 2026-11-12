'use client';
import { BookOpen } from 'lucide-react';
import { useResource } from './client';
export function Header() {
  const { data: c, error } = useResource('config');
  return (
    <>
      {error && <div className="notice" role="alert">Não foi possível consultar a disponibilidade da loja. Tente novamente em instantes.</div>}
      {c && !c.salesEnabled && (
        <div className="notice">Loja em configuração · Vendas desativadas</div>
      )}
      {c?.salesEnabled && c.mode === 'test' && (
        <div className="notice">Ambiente de teste · Não são vendas reais</div>
      )}
      <header className="header">
        <a className="brand" href="/">
          <BookOpen />
          {c?.name || 'Sua Livraria'}
          <span>digital</span>
        </a>
        <nav aria-label="Principal">
          <a href="/catalogo">Ebooks</a>
          <a href="/biblioteca">Meus ebooks</a>
          <a className="login-link" href="/conta">
            Minha conta ↗
          </a>
        </nav>
      </header>
    </>
  );
}
export function Footer() {
  const { data: c } = useResource('config');
  return (
    <footer>
      <a className="brand" href="/">
        {c?.name || 'Sua Livraria'}
        <span>digital</span>
      </a>
      <p>Uma boa leitura abre possibilidades.</p>
      <nav aria-label="Rodapé">
        <a href="/contato">Contato</a>
        <a href="/privacidade">Privacidade</a>
        <a href="/termos">Termos</a>
        <a href="/admin">Administração</a>
      </nav>
      <small>
        {c?.legal?.name || 'Nome e identidade visual provisórios.'}
        {c?.legal?.document ? ' · ' + c.legal.document : ''}
      </small>
    </footer>
  );
}
