# Guia para entender o código da Loja de eBooks

Este documento é um mapa do projeto. Ele explica onde começar e onde encontrar cada funcionalidade, sem exigir que você leia os arquivos na ordem alfabética.

## Por onde começar

1. **`README.md`**: veja como instalar, testar e preparar a implantação.
2. **`app/page.tsx`**: página inicial que apresenta a loja e os livros.
3. **`app/globals.css`**: cores, espaçamentos, responsividade e estilo visual.
4. **`app/chrome.tsx`**: cabeçalho, navegação e rodapé.
5. **`app/client.tsx`**: funções compartilhadas que chamam a API e carregam dados.
6. **`app/api/[...path]/route.ts`**: ponto de entrada HTTP da API.
7. **`server/router.ts`**: escolhe o que fazer com cada requisição.
8. **`db/schema.ts`**: estrutura das tabelas do banco de dados.

## Organização das pastas

| Caminho | Para que serve |
| --- | --- |
| `app/` | Telas públicas, conta, catálogo, checkout, pedidos, biblioteca e painel de administração. |
| `app/conta/` | Cadastro, acesso, confirmação de e-mail e captcha. |
| `app/admin/` | Cadastro de eBooks, upload, pedidos e acompanhamento administrativo. |
| `app/api/` | Entrada única para as requisições da aplicação. |
| `components/ui/` | Componentes visuais reutilizáveis. Muitos fazem parte da biblioteca de interface, não da regra de negócio. |
| `server/base.ts` | Tipos de ambiente, consultas ao banco e funções auxiliares. |
| `server/router.ts` | Rotas e validações para catálogo, pedidos, biblioteca e administração. |
| `server/auth.ts` | Integração com o Supabase e identificação de usuários. |
| `server/payments.ts` | Integração Pix via Mercado Pago e conciliação de pagamento. |
| `server/files.ts` | Envio, armazenamento e downloads privados dos PDFs. |
| `server/security.ts` | Controles de segurança usados pela API. |
| `db/` | Definições e acesso ao banco Cloudflare D1. |
| `drizzle/` | Migrações SQL do banco. |
| `public/` | Imagens e ícones exibidos no site. |
| `scanner/` | Serviço separado de análise de arquivos enviados. |
| `scripts/` | Scripts de operação, migração, backup, restauração e testes. |
| `tests/` | Testes automatizados do projeto. |
| `docs/` | Documentação técnica, segurança, operação e validação. |

## Como as partes se comunicam

```text
Navegador do visitante
        |
        v
app/ (telas React)
        |
        v
app/client.tsx (requisições HTTP)
        |
        v
app/api/[...path]/route.ts
        |
        v
server/router.ts
   |       |         |         |
   v       v         v         v
 auth   payments   files     D1 (dados)
   |       |         |
Supabase Mercado    R2 (arquivos)
         Pago
```

### Exemplo: mostrar o catálogo

1. `app/page.tsx` e `app/catalogo/page.tsx` solicitam dados com `useResource`.
2. `app/client.tsx` busca `/api/products`.
3. `server/router.ts` consulta os produtos publicados no banco D1.
4. A tela mostra os itens encontrados ou a mensagem de catálogo vazio.

### Exemplo: comprar e baixar um eBook

1. A interface de checkout está em `app/checkout/[id]/page.tsx`.
2. A API chama `server/payments.ts` para criar e verificar pedidos Pix.
3. A confirmação é conferida no provedor, inclusive pelo webhook `/api/webhooks/mercadopago`.
4. O pedido aprovado pode habilitar um link temporário de download, controlado por `server/files.ts`.
5. Os arquivos dos eBooks ficam no R2 privado, e não dentro de `public/`.

## Onde alterar cada coisa

- **Textos da página inicial**: `app/page.tsx`.
- **Identidade visual, cores e layout**: `app/globals.css` e `app/chrome.tsx`.
- **Tela do catálogo**: `app/catalogo/page.tsx` e `app/ebook/[id]/page.tsx`.
- **Tela de login**: `app/conta/page.tsx`.
- **Área de administração**: `app/admin/page.tsx`.
- **Regras de cobrança**: `server/payments.ts`, apenas depois de configurar e testar a integração.
- **Estrutura dos dados**: `db/schema.ts` e migrações em `drizzle/`.

## Comandos úteis

Executar na pasta do projeto após instalar Node e as dependências:

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run format
npm run format:check
npm run build
```

`npm run format` aplica o formatador configurado (`oxfmt`) ao projeto. Revise o diff antes de enviar alterações ao GitHub. O código original já veio em arquivos separados e parcialmente formatados; os arquivos em `components/ui/` podem permanecer extensos por serem componentes compartilhados.

## Atenção à segurança

- `.env.example` contém **nomes das variáveis**, não as credenciais reais.
- Não envie `.dev.vars`, `.env`, tokens de acesso, backups, PDFs privados nem dados dos clientes ao GitHub.
- As vendas começam desativadas. Sem configurar provedores reais, banco, armazenamento e verificações operacionais, a aplicação não está pronta para receber pagamentos.
- Documentos de segurança e execução de testes do pacote exportado são históricos, não garantias de que a configuração atual esteja pronta.

Para configuração de produção, leia `docs/OPERACAO.md`, `docs/SEGURANCA.md` e `docs/VALIDACAO.md`.
