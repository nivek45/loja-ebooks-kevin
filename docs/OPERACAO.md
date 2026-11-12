# Operação, configuração e publicação

## 1. Autenticação e email

Veja também `ETAPA-AUTENTICACAO.md`: configuração do CAPTCHA nativo no Supabase, widget Turnstile, inspetor de configuração e roteiro de homologação dos endpoints diretos. Em produção, a loja exige `TURNSTILE_SITE_KEY`; isso não substitui ativar e testar o CAPTCHA no provedor.

Crie um projeto Supabase exclusivo para testes e outro para produção. Em Auth, habilite email/senha, confirmação de email e TOTP. Configure senha mínima de 12 caracteres, proteção contra senhas vazadas quando disponível, expiração curta de JWT, limites de autenticação e de envio de emails. Use SMTP transacional com domínio verificado (SPF/DKIM/DMARC). Não use a limitação de emails do serviço padrão como configuração de produção.

Preencha `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no servidor. A chave publishable não é uma chave administrativa. A aplicação não precisa de `service_role`. Jamais coloque essa chave administrativa em uma variável com prefixo público, no navegador ou no Worker.

Site URL e redirects devem ser a origem exata do ambiente e `/conta/confirmar`. Nos templates de confirmação de cadastro e recuperação, use o link abaixo, alterando `signup` para `recovery` no template de recuperação:

```html
<a href="{{ .SiteURL }}/conta/confirmar?token_hash={{ .TokenHash }}&type=signup">Confirmar meu email</a>
```

O cliente abre o link, confirma por POST e o servidor troca o token por sessão pelo SDK oficial. O hash é retirado da barra de endereço; a página não contém analytics e envia `Referrer-Policy: no-referrer`. Evite registrar query strings no proxy e no provedor de logs. O template padrão com fragmentos de access token não é usado por esta implementação.

Teste: cadastro → email entregue → confirmação → login → logout → recuperação → nova senha → login. Confira também links vencidos, email já usado e conta inexistente. Verifique recuperação de contas com MFA no ambiente configurado. Endureça as configurações do Supabase, inclusive os endpoints acessíveis diretamente no serviço.

## 2. Primeiro administrador e permissões

Não existe usuário/senha padrão ou formulário público de administrador.

1. Cadastre uma conta normal, confirme o email e entre.
2. Em Minha conta → Segurança, cadastre e confirme o TOTP em um autenticador.
3. Um operador com acesso à infraestrutura confirma a identidade do responsável e o UUID no painel Supabase.
4. Em um terminal confiável, configure temporariamente `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPERATOR_ID` (identificação do operador) e `CLOUDFLARE_DATABASE_NAME`. Autentique o Wrangler com uma credencial Cloudflare restrita ao projeto.
5. Execute `node scripts/admin.mjs grant UUID_DO_SUPABASE`. O script verifica email e fator TOTP no Supabase antes de gerar a alteração e o registro de auditoria. Para retirar acesso, use `revoke`.
6. Remova a chave administrativa do ambiente do terminal ao terminar. Entre novamente na loja e confirme o TOTP.

Esse comando é para uma conta Cloudflare controlada pelo operador. Em hospedagem Sites gerenciada, o nome/acesso administrativo ao D1 pode não estar exposto: solicite o procedimento de operação do banco à plataforma ou use uma hospedagem Cloudflare própria. **A criação de administrador no ambiente remoto não foi executada.** A migração não concede permissões a ninguém.

Todas as rotas `/api/admin/*` exigem conta autorizada em `admins` **e** sessão `aal2`, verificadas no servidor. O usuário não consegue promover a si mesmo por metadados do perfil. As permissões só são geridas pela ferramenta operacional. Perder TOTP exige recuperação supervisionada pelo operador, com verificação de identidade e registro de incidente; não remova MFA para facilitar login.

## 3. Cadastrar ebooks

Configure e teste o scanner antes do primeiro upload. No painel:

1. Informe título, descrição e preço em reais (mínimo R$ 1,00; máximo R$ 10.000,00).
2. Envie capa PNG/JPEG até 2 MB e PDF até 20 MB. EPUB não é suportado nesta versão.
3. Aguarde a aprovação da inspeção. Não há opção de ignorar o antivírus.
4. Ative “Disponível no catálogo” e salve. Para desativar, desligue essa opção e salve.

PDFs com criptografia, anexos, formulários, scripts ou ações externas são recusados. Essa política pode rejeitar ebooks legítimos com links; exporte um PDF simples para distribuição. Desativar o produto interrompe novas vendas, mas preserva as compras existentes. Substituir o PDF não apaga versões já compradas.

## 4. Scanner

```sh
cd scanner
npm ci
# Forneça SCANNER_TOKEN aleatório de pelo menos 32 caracteres pelo gerenciador de segredos.
docker build -t ebook-scanner .
docker run --rm -p 127.0.0.1:8080:8080 --env SCANNER_TOKEN ebook-scanner
```

Publique `/scan` atrás de HTTPS e autenticação de serviço. Configure `SCANNER_URL` e `SCANNER_TOKEN` no Worker. O container inicia ClamAV, atualiza as assinaturas com freshclam e executa o servidor de upload como usuário sem privilégio. Dimensione memória (ClamAV exige vários GB), disco temporário e limite de concorrência; restrinja ingress ao serviço da loja por gateway quando possível. Não exponha clamd/TCP ou seu socket na internet. Os arquivos temporários são removidos ao final da análise.

Valide a imagem, a atualização das assinaturas, um arquivo EICAR, um PDF comum, um PDF com JavaScript/anexo e imagens inválidas. Falha, timeout ou resultado sem hash correspondente bloqueia o upload. **O Docker/ClamAV não estava disponível no ambiente de entrega; a execução desse serviço é uma pendência.**

## 5. Mercado Pago e Pix

O recebimento desta integração ocorre na **conta Mercado Pago associada ao Access Token**, não diretamente na chave Pix pessoal de outro banco. Cadastre uma conta aceita pelo provedor, conclua sua identificação, confirme as condições e taxas e cadastre uma chave Pix na conta recebedora conforme as instruções dele.

Crie a aplicação no painel de desenvolvedores. Configure a integração da Payments API e o evento **Pagamentos (`payment`)**. Esta aplicação não consome o tópico `orders` da Orders API.

Por ambiente, configure:

- `MP_ACCESS_TOKEN`: Access Token correto da aplicação/conta daquele ambiente.
- `MP_WEBHOOK_SECRET`: segredo gerado em Webhooks, usado para HMAC-SHA256.
- `MP_COLLECTOR_ID`: identificador numérico da conta recebedora, conferido pelo operador via API `GET /users/me` com o token. Não é a chave Pix.
- `PAYMENT_MODE=test` ou `production`. Não inferimos o ambiente pelo prefixo do token, pois o provedor possui particularidades entre produtos e credenciais.
- `APP_ORIGIN`: URL HTTPS exata, sem barra final.
- URL de webhook: `https://SEU_DOMINIO/api/webhooks/mercadopago`.

Habilite os eventos de criação e atualização de pagamentos. O webhook precisa ser acessível pelo Mercado Pago sem login, challenge interativo ou bloqueio da hospedagem. A proteção é a assinatura oficial e a consulta autenticada do recurso. Uma prévia Sites privada não serve como endpoint produtivo.

O endpoint extrai `data.id` da query, `x-request-id` e `ts/v1` de `x-signature`; verifica a assinatura sobre `id:...;request-id:...;ts:...;`. O timestamp assinado pode aparecer novamente em uma retentativa atrasada. Não existe janela estreita que descarta automaticamente eventos legítimos antigos: a proteção contra replay usa a consulta atual ao provedor, chave única de evento e aplicação condicional da versão.

A criação usa UUID por pedido em `X-Idempotency-Key`, preço do banco e payload cifrado persistido para a retentativa. Não crie um novo pedido ao ver timeout: tente novamente na mesma tela. Verifique também o pedido em Meus ebooks. Se uma criação ficou ambígua, o operador deve reconciliar com o provedor antes de orientar uma nova compra.

Pedidos exibem QR Code, Copia e Cola e validade de 30 minutos. O provedor pode recusar uma configuração/campo; teste os requisitos de CPF e expiração na sua conta. O QR retornado no ambiente de teste não deve ser pago com dinheiro real. Siga os procedimentos oficiais específicos da **Payments API**; os exemplos de teste da Orders API não são intercambiáveis.

Uma página “aprovado” no navegador nunca libera o arquivo. A concessão depende do pedido confirmado no banco após validar identificador, referência externa, metadata, valor bruto, BRL, Pix, collector e `live_mode`.

## 6. Segredos e ativação

Gere segredos com um gerenciador confiável ou `crypto.randomBytes` do Node. `PII_ENCRYPTION_KEY` é base64 de 32 bytes aleatórios para AES-256-GCM; `RATE_LIMIT_SECRET` protege os identificadores de rate limit. `CRON_SECRET`, `SCANNER_TOKEN` e `ALERT_TOKEN` devem ser diferentes entre si e entre ambientes. Nunca use os valores dos fixtures de teste.

Todos os nomes estão em `.env.example`. `.dev.vars` é somente local e ignorado pelo Git. Use valores de runtime no serviço de hospedagem; não faça substituição de segredos durante o build. Preserve a chave de cifragem antiga durante a janela de retentativa ao planejar rotação, ou conclua/reconcilie as tentativas antes da troca.

`SALES_ENABLED=true` e `LEGAL_REVIEWED=true` são portas operacionais, não certificações de conformidade. A configuração também exige os dados comerciais e todos os serviços. Edite os textos legais em `app/legal.tsx`, substitua todos os campos e publique novamente antes de marcar revisão. As variáveis `LEGAL_NAME`, `LEGAL_DOCUMENT`, `LEGAL_ADDRESS` e `CONTACT_EMAIL` não preenchem as demais condições legais.

## 7. Publicação

A aplicação tem `.openai/hosting.json` para Sites, que fornece os bindings `DB` e `FILES` e aplica as migrações `drizzle/`. Uma prévia privada pode ser publicada com vendas desativadas. Para vendas abertas, confirme suporte a origem pública, cookies de primeira parte, Supabase externo, endpoint de webhook anônimo e operações de backup/admin na plataforma.

Em Cloudflare própria, crie D1 e R2 separados por ambiente e configure as referências em `vite.config.ts` (`database_id`, `database_name`, `bucket_name`). Preserve os nomes dos bindings. Não publique com o UUID marcador `00000000-0000-4000-8000-000000000000`. Execute build, aplique migrações com Wrangler no banco correto e publique `dist/server/wrangler.json`. Configure os segredos de runtime com Wrangler ou painel e teste o domínio HTTPS.

Não ative acesso público ao R2 (`r2.dev`, domínio público ou políticas equivalentes). Somente o Worker deve ter acesso ao bucket. Para arquivos públicos a aplicação oferece exclusivamente a rota de capa vinculada a produto publicado.

## 8. Reconciliação, erros e alertas

Agende `npm run maintenance` a cada cinco minutos em um executor confiável. Configure `APP_ORIGIN` e `CRON_SECRET` no executor. A rota interna processa até 20 pedidos por execução, priorizando os menos recentemente consultados, e limpa tokens/limites expirados. Monitore o tempo da fila; ajuste frequência ou capacidade se o volume crescer. Não depende de eventos de navegador.

Configure `ALERT_URL` HTTPS e `ALERT_TOKEN` para um receptor operacional privado que encaminhe notificações. Ele recebe `{id,kind,target,created_at}` e deve deduplicar por `Idempotency-Key`. Há uma caixa de saída persistente; falhas de envio ficam para a próxima execução. Monitore **também externamente** falha ou ausência do agendamento, pois um job que não roda não envia seus próprios alertas. O código não foi conectado a email/Slack real.

O painel mostra alertas e auditoria, sem email/CPF dos compradores nas listagens de vendas. Falhas inesperadas geram somente um identificador de correlação, sem stack ou payload. Configure retenção e redação de URLs, cookies e headers no proxy, Cloudflare e Supabase: a aplicação não controla todos os logs de infraestrutura.

Reembolsos são feitos no painel do Mercado Pago. Qualquer valor reembolsado, inclusive parcial, revoga todo o acesso daquele pedido após confirmação. Webhook/reconciliação fazem essa atualização; uma transferência manual fora do provedor não altera o pedido automaticamente.

## 9. Backup e restauração

Tenha três planos: banco D1, objetos R2 e identidades/configuração Supabase. Um backup de pedidos não contém senhas ou as identidades gerenciadas. Guarde configurações/segredos em cofre separado.

Em Cloudflare própria, `npm run backup` usa `wrangler d1 export` com `CLOUDFLARE_DATABASE_NAME` e gera SQL em `backups/`. Esse diretório é ignorado pelo Git; cifre imediatamente os backups, aplique retenção e copie para outro local com acesso restrito. Use Time Travel do D1 como proteção adicional, conforme o plano contratado.

Copie os objetos privados do R2 por um cliente S3 com token restrito de leitura, inventário de chaves e hashes SHA-256 para um destino cifrado separado. Evite comandos `sync --delete` e não exponha a cópia publicamente. Preserve objetos antigos usados por pedidos. Habilite backups/PITR e verifique exportação e restauração de `auth` no Supabase conforme o plano contratado.

Restauração: crie um D1 novo cujo nome termine em `-restore`; configure `RESTORE_DATABASE_NAME` e rode `npm run restore -- caminho/backup.sql`. O script só permite o banco isolado, aplica SQL e consulta integridade, relações e contagens. Compare com o inventário, restaure cópia privada dos objetos, confira hashes e valide login, pedidos e download com contas de teste. Só planeje a troca de tráfego após aprovação dos resultados; não restaure diretamente por cima da produção.

O ensaio automatizado entregou exportação de dados de um **D1 local**, importação em SQLite isolado, checagem de integridade/relações e cópia de objeto R2 local com hash. **Não houve exportação/restauração de D1/R2/Supabase reais.** Em Sites gerenciado, obtenha primeiro os recursos de backup/restore da plataforma; não presuma que os comandos de uma conta Cloudflare própria operam o banco gerenciado.

## 10. Dados pessoais

A exportação pelo cliente entrega seus próprios pedidos e solicitações. Pedidos de exclusão geram registro e alerta para revisão humana; não apagam registros fiscais indiscriminadamente. Defina bases legais, responsáveis, prazos de resposta/retenção e procedimento de incidentes. Para localizar/atender uma solicitação, o operador autorizado consulta o registro por ID no banco e a identidade no Supabase. Documente decisões de retenção e revogação. A interface não declara conformidade automática.
