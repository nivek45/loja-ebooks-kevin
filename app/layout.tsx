import type { Metadata } from 'next';
import { Header, Footer } from './chrome';
import './globals.css';
export const metadata: Metadata = {
  title: 'Livraria digital | Ebooks',
  description: 'Ebooks em português. Sua próxima leitura começa aqui.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        <Header />
        <main id="conteudo">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
