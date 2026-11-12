# Etapa de autenticação e operação — 19/09/2026

## O que foi implementado

O banco da loja já é D1/SQLite, declarado em `.openai/hosting.json`, com schema em `db/schema.ts` e migração em `drizzle/0000_store.sql`. Produtos, pedidos, itens, permissões, auditoria, alertas e tokens ficam nele. Supabase gerencia identidades, senhas e MFA; não é necessário duplicar o catálogo em um segundo banco. Consultas parametrizadas, autorização por proprietário e validação de origem foram preservadas.

As duas falhas anteriores continuam corrigidas: saturar o limite de login não impede apagar os cookies no logout; falha de revogação do provedor retorna aviso de encerramento parcial, com alerta persistente, inclusive após troca de senha. Testes de regressão incluem indisponibilidade, timeout e falha do banco de limites.

Esta etapa acrescenta widget Turnstile nos formulários de cadastro, login e recuperação, renovado após cada tentativa. O servidor limita o tamanho do token e o encaminha ao SDK Supabase. A validação criptográfica do CAPTCHA é feita pelo próprio Supabase, uma única vez. Tokens faltantes são recusados quando o widget está configurado; produção sem chave do widget bloqueia novos logins e vendas. A presença da chave NÃO comprova que o CAPTCHA está ativado no provedor.

O script `node scripts/check-auth-config.mjs` consulta somente a configuração pela Management API e imprime resultados sem valores secretos. Precisa de `SUPABASE_PROJECT_REF`, `SUPABASE_MANAGEMENT_TOKEN` (acesso mínimo de leitura à configuração Auth) e `APP_ORIGIN` no ambiente do operador. Não coloque o token administrativo no Worker, navegador, Git ou chat. O script verifica origem/redirects, confirmação de email, senha mínima, CAPTCHA nativo, presença de SMTP, expirações, rotação e presença de limites. Campos ausentes não são aprovados. Não altera o projeto, não envia emails e não comprova entrega, MFA ou proteção contra todos os abusos.

Scripts de backup/restauração agora retornam falha também se o processo Wrangler não iniciar ou for encerrado por sinal; não anunciam sucesso nesses casos.

## Configuração externa necessária

1. Criar projetos Supabase separados para teste e produção. Definir email/senha, confirmação de email, mínimo de 12 caracteres, JWT de até 3600 segundos, OTP de até 3600 segundos, rotação de refresh tokens e TOTP. Desabilitar cadastro anônimo e provedores não utilizados. Ajustar os limites nativos conforme volume e plano, inclusive `/token`, `/signup`, `/recover`, `/verify` e MFA. Um proxy no site não substitui esses limites.
2. Definir Site URL como a origem exata do ambiente, e permitir apenas essa origem e `/conta/confirmar` nos redirects. Usar os templates TokenHash descritos em `OPERACAO.md`, sem fragmentos de access token.
3. Criar widget Cloudflare Turnstile com hostnames exatos, sem liberação para qualquer domínio. Colocar **a chave secreta no Supabase Auth → Bot and Abuse Protection**, selecionar Turnstile e habilitar a proteção. Colocar somente a chave pública em `TURNSTILE_SITE_KEY` na loja. Nunca usar chaves de demonstração em produção. A CSP permite o frame e as conexões do domínio oficial, mantendo nonce, strict-dynamic e bloqueio de frames externos sobre a loja.
4. Configurar SMTP transacional no Supabase, com remetente e domínio próprios verificados, SPF/DKIM/DMARC. Credenciais SMTP permanecem no provedor; o Worker não envia emails diretamente. Conferir quotas, bloqueios, bounces e reputação. Não encaminhar mensagens a clientes antes da homologação.
5. Configurar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e segredo de rate limiting no ambiente da loja. Criar o primeiro administrador pelo procedimento operacional documentado, após confirmação de email e TOTP. Não há senha padrão nem concessão por perfil.

## Roteiro obrigatório no ambiente real (ainda pendente)

- Cadastro de conta de teste própria; entrega de email; confirmação; login; logout; recuperação; nova senha. Verificar uso único e expiração reais, mensagens genéricas, tempo de resposta e tentativa de reutilizar sessões revogadas. JWT pode continuar válido até expirar conforme política do provedor; não alegar revogação imediata de todo access token sem testar.
- Inscrição e verificação TOTP real; recusa de código inválido/expirado; admin recusado em aal1 e permitido apenas com allowlist+aal2; testar recuperação de conta com MFA sem remover a proteção administrativa.
- Fazer chamadas diretamente ao Supabase `/auth/v1/signup`, `/auth/v1/token?grant_type=password` e `/auth/v1/recover`, com conta de teste própria e token CAPTCHA ausente/inválido: exigir recusa pelo provedor. Testar token vencido/reutilizado. Não aceitar o limite do site como evidência desses testes. Com token válido, testar o fluxo do navegador e renovar o widget depois de cada tentativa.
- Rodar scanner real ClamAV/qpdf/sharp atualizado: PDF simples, PDF ativo, imagem inválida, arquivo EICAR; conferir falha fechada. Docker não está disponível nesta máquina, portanto essa execução continua pendente.
- Verificar R2 remoto sem r2.dev/domínio público; copiar objetos e hashes para destino privado cifrado. Exportar/restaurar D1, R2 e identidades/configuração Supabase em ambiente isolado. O ensaio automatizado local não é um backup de produção.
- Conectar receptor de alertas e executar manutenção agendada. Confirmar entrega real e alerta externo de ausência do job. Validar HTTPS, cookies, CSP, limites/DDoS/WAF do host e acesso anônimo autenticado por assinatura ao webhook. A publicação atual é privada e não atende vendas públicas.
- Configurar conta Mercado Pago e credenciais próprias conforme `OPERACAO.md`; testar ambiente de teste; somente depois realizar compra real controlada, conferir valor/recebedor/webhook/download/reembolso e revogação do acesso. A chave Pix pessoal sozinha não ativa a API. Manter `SALES_ENABLED=false` até concluir as validações e os dados legais.

## Evidências e limites

65 testes passaram, zero falhas. TypeScript e build passaram; lint sem erros, com avisos preexistentes de `any`. A inspeção estática verificou 28 arquivos cliente sem nomes de segredos de servidor e sem ebooks/banco/ambiente no diretório público. Testes automatizados usam D1/R2 locais reais do emulador e SDK Supabase com respostas HTTP controladas. Não são uma homologação dos serviços externos. O relatório de execução desta etapa está em `testes-etapa-autenticacao.txt`.

Auditoria npm da loja (818 dependências contadas pelo npm) e do scanner (42): zero vulnerabilidades conhecidas retornadas em 19/09/2026. Isso não garante ausência de vulnerabilidades. Não foram alteradas versões de dependências nesta etapa. A stack Vinext ainda é beta; os avisos de migração de middleware e importação JSON devem ser acompanhados.

Nenhuma conta externa, SMTP, chave CAPTCHA, scanner remoto ou pagamento real foi configurado nesta etapa sem credenciais. O inspetor da Management API foi testado com fixture, não contra um projeto Supabase real.

Fontes oficiais consultadas: [CAPTCHA Supabase](https://supabase.com/docs/guides/auth/auth-captcha), [limites Auth](https://supabase.com/docs/guides/auth/rate-limits), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config), [widget Turnstile](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).
