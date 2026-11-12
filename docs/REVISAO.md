# Revisão da loja — 17/09/2026

A aplicação possui interface, API, banco, controles de acesso, integração Pix e entrega privada implementados. Ainda não está habilitada para vendas: faltam contas, credenciais, produtos reais e validações externas. Nenhum pagamento real foi realizado nesta revisão.

## Páginas, textos e fluxos

| Área | Situação e alteração |
|---|---|
| Inicial | Nome provisório “Sua Livraria”, capa identificada como exemplo e catálogo vazio. Corrigida a confusão entre carregamento, erro e ausência de produtos. Não há avaliações ou vendas fictícias. |
| Catálogo e ebook | Preços em BRL e arquivos PDF. Publicação exige produto, capa e arquivo aprovados. Faltam os ebooks reais do vendedor. |
| Conta | Login bloqueado sem configuração necessária. Retorno ao checkout/biblioteca após login preservado com destino restrito a rotas internas. Chave do autenticador removida da tela após confirmação ou saída. |
| Confirmação | Texto simplificado; recuperação tem botão próprio e encerra o formulário após salvar a senha. Links de email ainda exigem configuração e teste real do Supabase/SMTP. |
| Checkout | Aviso quando as vendas estão fechadas; CPF inválido recebe orientação específica. Valor continua calculado no servidor. |
| Pedido | Identificador completo para atendimento; download somente após aprovação. Corrigida a expiração com data de atualização inalterada. Tentativa vencida sem cobrança é encerrada pela manutenção. |
| Biblioteca | Login preserva destino; troca de página não reutiliza dados da página anterior. |
| Administração | Consultas iniciadas após autorização na interface, mantendo checagem obrigatória no servidor. Erros de vendas/registros aparecem. Edição bloqueada durante upload para evitar vincular arquivo ao ebook errado. Nova aba mostra presença de configurações, sem revelar segredos nem afirmar homologação. |
| Contato | Email, identidade e horário reais não foram informados. Campos permanecem identificados como pendentes. O canal será um link de email; não há formulário simulando envio. |
| Termos e privacidade | Rascunhos identificados. Licença, reembolso, retenção e atendimento exigem informações e revisão do vendedor. Texto sobre rastreamento distingue o código da loja dos serviços de infraestrutura. |

## Correções transversais

- Origem configurada corrigida para o endereço efetivamente publicado; a atualização do ambiente será aplicada pela nova publicação.
- Renovação simultânea de sessão compartilha uma solicitação por página. Erros de rede e respostas HTML recebem mensagens legíveis.
- Erros em páginas públicas não sugerem login indevidamente; áreas restritas preservam destino.
- Ajustes para largura pequena, identificadores longos e abas administrativas. Nenhum dado comercial inventado.

## Verificações

- 39 testes aprovados, zero falhas. D1/R2 locais, provedores externos substituídos por fixtures. Não houve Pix real.
- TypeScript e build aprovados. Lint sem erros, com 42 avisos `any`. Build informa middleware depreciado e classificação de rotas limitada no Vinext beta.
- Auditoria npm da aplicação e lockfile do scanner sem vulnerabilidades conhecidas na consulta; não cobre Linux, infraestrutura ou pentest.
- Varredura de 28 arquivos de cliente sem nomes de segredos do servidor/payload cifrado; nenhum ebook, banco ou ambiente no diretório público.
- Inspeção visual local em largura estreita de biblioteca/conta; navegação ao login preservando destino, aba de recuperação e bloqueio sem configuração conferidos. Revisão de código de todas as páginas e APIs. Sem fluxo autenticado completo no navegador ou teste com leitor de tela.
- A publicação exige acesso ChatGPT do proprietário, uma camada da hospedagem diferente da conta do comprador.

## Pendências para vender

1. Definir nome, identidade visual, email de atendimento, dados verdadeiros do responsável e políticas comerciais; revisar documentos legais.
2. Configurar Supabase/SMTP, confirmar a conta do responsável, cadastrar TOTP e conceder administração pelo procedimento operacional.
3. Criar/verificar conta e aplicação Mercado Pago, configurar credenciais no gerenciador de segredos e webhook. Não enviar segredos pelo chat.
4. Hospedar/testar scanner, manutenção, alertas e backups; testar restauração real.
5. Cadastrar PDFs próprios, capas, títulos, descrições e preços.
6. Preparar origem acessível aos clientes e webhook acessível ao provedor. A prévia privada atual não atende essa condição. O bucket permanece privado mesmo com site público.
7. Homologar com duas contas reais: compra, aprovação, download, acesso alheio, expiração e reembolso. Depois de ativar produção, fazer compra real controlada e conferir recebedor, valor, entrega e reembolso antes de abrir vendas.

Consulte [operação](OPERACAO.md) e [validação](VALIDACAO.md). A aba administrativa indica presença de configuração, não funcionamento ou segurança garantida.

Fontes oficiais consultadas: [Pix na Payments API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix?scope=prod) e [Supabase no servidor](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
