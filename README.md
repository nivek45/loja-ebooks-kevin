# Loja de ebooks — instalação e entrega

Aplicação em português, com preços em reais, catálogo, conta de cliente, biblioteca, painel administrativo, cobrança Pix pelo Mercado Pago e downloads privados. **As vendas começam desativadas. Não houve cobrança real, homologação com credenciais externas ou ativação comercial.**

A identidade “Sua Livraria” e a capa “O Essencial — edição demonstrativa” são substituíveis. O banco começa vazio: nenhum produto fictício é anunciado como uma compra disponível.


## Navegação rápida pelo código

O código foi separado por responsabilidade para facilitar a leitura. Para começar, veja:

- [Guia completo do código](docs/GUIA-DO-CODIGO.md): organização das pastas, fluxo das telas e pontos de alteração.
- [`app/page.tsx`](app/page.tsx): página inicial da loja.
- [`app/globals.css`](app/globals.css): estilos e cores da interface.
- [`server/router.ts`](server/router.ts): rotas e regras da API.
- [`db/schema.ts`](db/schema.ts): modelo do banco de dados.
- [Operação e configuração](docs/OPERACAO.md): recursos externos e infraestrutura.

**Observação:** o pacote mantém a implementação exportada, sem credenciais. A formatação pode ser reaplicada com `npm run format`, após `npm ci`.

## Arquitetura

- React/Vinext e um servidor no Cloudflare Workers, no mesmo domínio: interface e API sem CORS aberto.
- D1/SQLite para catálogo, pedidos, eventos, permissões e auditoria; R2 privado para os arquivos.
- Supabase Auth para email/senha, confirmação, recuperação e TOTP. A aplicação não implementa hashing de senhas nem mantém uma tabela de senhas.
- Mercado Pago Payments API (`/v1/payments`) para Pix. A API Orders também existe; esta implementação usa explicitamente Payments, com evento `payment`, conforme a documentação atual de Pix dos Bricks. Não misture webhooks `orders` com esta integração.
- Um serviço isolado de inspeção de arquivos com ClamAV e qpdf. É separado porque Workers não executa antivírus ou processos de sistema.

Um pedido contém um ebook, sem carrinho ou descontos. Isso simplifica o checkout e a reconciliação de uma pequena loja. O catálogo suporta vários produtos. O arquivo de cada compra é fixado no pedido, preservando a versão adquirida quando o administrador substitui o PDF.

O scaffold Sites usa **Vinext beta e ferramentas Cloudflare com componentes de desenvolvimento alpha**. O build foi validado localmente; essa maturidade e os testes pendentes precisam ser avaliados antes de produção. Não há alegação de segurança total, auditoria independente ou adequação automática à LGPD.

## Instalação local

Requisitos: Node 24 LTS, npm e acesso à rede. O scanner também exige Docker ou uma máquina Linux com ClamAV, qpdf e as dependências de `scanner/`.

```sh
npm ci
# Copie .env.example para .dev.vars e preencha apenas as configurações do ambiente local.
npm run build
npm run db:migrate:local
npm run dev
```

Abra a URL exibida pelo servidor. Sem credenciais, o catálogo vazio e as páginas informativas funcionam; cadastro, pagamentos e uploads permanecem bloqueados. Não existem credenciais, usuários ou pagamentos de demonstração na aplicação publicada.

Para verificar:

```sh
npm run typecheck
npm run lint
npm test
npm audit
npm run build
```

`npm test` utiliza o motor local Cloudflare/Miniflare para D1 e R2 e substitui os provedores de autenticação/pagamento por respostas de teste no limite HTTP. **Não prova que uma conta real do Supabase ou do Mercado Pago foi configurada.** Consulte o relatório em `docs/VALIDACAO.md`.

## Estrutura

- `app/`: páginas da loja, checkout, conta, biblioteca e painel.
- `app/api/[...path]/route.ts`: entrada da API no Worker.
- `server/`: autenticação, autorização, proteção, pagamentos, arquivos e rotinas.
- `db/schema.ts` e `drizzle/`: estrutura e migrações geradas.
- `scanner/`: serviço de inspeção, imagem Docker e lockfile.
- `scripts/`: migrações, testes, permissões administrativas, backups e manutenção.
- `tests/`: testes de segurança e contratos de autenticação.
- `.env.example`: todas as variáveis da aplicação, sem segredos.
- `docs/OPERACAO.md`: contas externas, administrador, Pix, publicação e recuperação.
- `docs/SEGURANCA.md`: controles e limites concretos.
- `docs/VALIDACAO.md`: o que foi executado e o que depende de infraestrutura real.

## Antes de vender

1. Definir nome, identidade, produtos e direitos de distribuição.
2. Criar as contas de hospedagem, Supabase e Mercado Pago; concluir identificação e habilitar Pix na conta recebedora do Mercado Pago. Uma chave Pix de outro banco, sozinha, não ativa esta API.
3. Configurar autenticação, email transacional, MFA, inspeção de arquivos, alertas, agendamento e backups.
4. Preencher dados comerciais e substituir **todos** os trechos entre colchetes nas páginas legais; revisar com profissional responsável.
5. Executar a homologação externa e a restauração completa em infraestrutura real.
6. Configurar credenciais de produção, domínio HTTPS e webhook público; conferir a conta recebedora.
7. Fazer uma compra real controlada e um reembolso, verificando o bloqueio de novos downloads.
8. Só então abrir as vendas e acompanhar os primeiros pedidos.

Não ative `SALES_ENABLED` apenas para retirar o aviso visual: o servidor faz verificações adicionais e a validação operacional continua necessária.
