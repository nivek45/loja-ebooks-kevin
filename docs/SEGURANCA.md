# Controles de segurança e limites

## Autenticação e autorização

O servidor usa o SDK Supabase para validar usuário e claims. Os tokens ficam em cookies HttpOnly, SameSite=Strict e Secure no HTTPS, com prefixo `__Host-`; apenas localhost usa cookies de desenvolvimento. Nenhuma senha é armazenada no D1. A aplicação não implementa um algoritmo de senha próprio.

Login e recuperação têm limites persistentes por origem de rede e identificador cifrado por HMAC. O proxy precisa sobrescrever `CF-Connecting-IP`; não coloque um proxy que aceite esse header diretamente do cliente. A recuperação retorna a mesma mensagem para contas existentes e inexistentes. Os limites e a proteção do próprio Supabase também precisam estar configurados.

A validade da sessão é conferida no servidor. Logout revoga refresh tokens no serviço e apaga cookies; como ocorre com JWTs do Supabase, um access token já copiado pode continuar válido até expirar. Configure uma validade adequada e um procedimento de revogação em incidentes. Não há promessa de revogação instantânea de JWTs roubados. Mais informações na [documentação de logout](https://supabase.com/docs/guides/auth/signout).

Pedidos e downloads sempre filtram o dono autenticado. A rota administrativa é centralizada e exige registro na tabela `admins` e claim `aal2` validado pelo provedor. Metadados fornecidos pelo usuário não concedem permissões. Não existe API pública para modificar administradores ou auditoria.

## Preço e pagamento

Dados de checkout são validados com Zod e campos extras são recusados. Só identificador do produto, chave de tentativa, CPF e aceitação dos termos são aceitos. Preço e disponibilidade são consultados no D1; o snapshot de item/valor é criado atomicamente em `batch`. UUID e índice único impedem pedidos duplicados da mesma tentativa.

O payload de retentativa, incluindo CPF, é protegido por AES-256-GCM, IV aleatório por registro e chave externa ao banco. O conteúdo cifrado é removido após estados terminais ou pela manutenção depois da janela operacional. O pedido guarda os dados de compra necessários, sem duplicar o CPF em texto aberto.

O webhook valida HMAC-SHA256 conforme o manifesto oficial e consulta o recurso pela API autenticada. São comparados valor, moeda, collector, Pix, ambiente e referências do pedido. Idempotência de eventos e atualização por versão do provedor reduzem efeitos de duplicação/reordenação. Reembolso é terminal, incluindo o caso conservador de empate de timestamp. O navegador não pode aprovar pedidos.

Falhas na API deixam a compra não aprovada. Uma criação com resposta perdida é repetida com o UUID do mesmo pedido e o mesmo payload. A fila de alertas registra falhas e divergências. O job de manutenção deve operar e ser monitorado externamente; sua ausência pode atrasar a descoberta de reembolsos ou pagamentos sem webhook.

Fontes implementadas: [Pix via Payments](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/pix) e [assinatura e notificações](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks), consultadas durante o desenvolvimento.

## Arquivos

R2 tem binding privado. A aplicação não retorna a chave do objeto ou URL permanente. O download usa token aleatório, hash no banco, validade de 60 segundos e consumo único atômico. A conta, propriedade e status aprovado são checados na emissão **e** no consumo. Há cotas persistentes por usuário. A resposta usa attachment, no-store e nosniff.

Reembolso revoga novos downloads e links ainda não consumidos. Uma requisição já autorizada/em transmissão pode terminar se o reembolso ocorrer simultaneamente. Depois de baixar, o comprador pode copiar ou compartilhar o PDF; estes controles não são DRM e não conseguem apagar arquivos já baixados.

Uploads conferem limite de bytes durante leitura, extensão e assinatura real do formato. São aceitos apenas PDF para ebook e PNG/JPEG para capa. O arquivo não é executado; somente o scanner autorizado o recebe. Sem resultado limpo com hash e MIME coincidentes, nada é publicado. A verificação do scanner não foi executada com ClamAV neste ambiente, e assinaturas antivírus não detectam todas as ameaças desconhecidas. Política baseada no [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## HTTP e aplicação

Consultas usam parâmetros; nomes das consultas e tabelas são fixos. O React escapa o texto de títulos e descrições, sem renderização de HTML enviado pelo administrador. Mutações verificam Origin exata e Fetch Metadata, exceto webhook assinado e rotina interna autenticada por segredo. Não há CORS permissivo.

Páginas usam CSP com nonce por resposta e `strict-dynamic` para scripts, `object-src 'none'`, `frame-ancestors 'none'`, base e formulários limitados ao domínio. Estilos inline são permitidos para os componentes; JavaScript inline sem nonce não é permitido. `unsafe-eval` é limitado ao desenvolvimento localhost. Headers incluem HSTS em HTTPS, no-referrer, nosniff, frame deny e Permissions-Policy. Confirme também o comportamento da plataforma/proxy no domínio final.

Os links internos usam navegação HTML normal para refletir mudanças de sessão. Imagens de QR/capa usam `<img>` diretamente, sem encaminhar conteúdo de pedidos ao otimizador global do framework. As respectivas sugestões de desempenho do linter foram desativadas deliberadamente; as regras de correção permanecem. Há 41 avisos de tipagem dinâmica `any` nos limites SQL/API/UI, documentados para melhoria futura. TypeScript passa; isso não substitui a validação de dados em runtime.

## Infraestrutura, permissões e disponibilidade

Use TLS no domínio e serviços externos, WAF/rate limits contra abuso, limites de CPU/memória, proteção DDoS do host, atualizações e monitoramento de gastos. Não aplique CAPTCHA interativo a webhooks. As cotas da aplicação não detêm sozinhas DDoS volumétrico. O scanner tem concorrência e tamanho limitados, mas requer isolamento e recursos próprios.

O Worker deve acessar somente seu D1 e seu R2; não mantenha credencial Cloudflare de administração nele. A chave Supabase no runtime é publishable, nunca service_role. Credenciais de deploy, backup e concessão de administrador pertencem ao operador, separadas e com MFA. D1 não fornece aqui papéis SQL por tabela: o binding permite acesso ao banco inteiro. A barreira contra clientes é a API; compromisso do Worker pode afetar o banco. Auditoria não é à prova de adulteração por quem controla a infraestrutura. Exporte os registros para retenção externa quando necessário.

Mantenha backups separados, cifrados e testados de banco, objetos e identidade. O teste local de exportação/restauração não comprova recuperação da produção. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) é proteção adicional, conforme a disponibilidade do plano.

## LGPD e operação humana

Não há analytics ou cookies de publicidade. Cliente exporta seus próprios dados e solicita exclusão; a solicitação requer tratamento pelo operador, inclusive avaliação de retenção legal. Campos jurídicos e comerciais continuam incompletos. Defina bases legais, contrato com operadores, transferências internacionais, retenção, resposta a titulares, incidentes e política de arrependimento antes de vender. O [guia da ANPD para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/processo-guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte.pdf) é uma referência, não uma certificação da loja.

## Escopo atual

PDF apenas, um ebook por pedido; biblioteca paginada em grupos de 100 pedidos; catálogo e listas administrativas mostram até 100 registros. Para catálogo maior, ampliar a paginação antes de ultrapassar esse limite. Reembolsos são realizados no provedor, sem botão financeiro na aplicação. O serviço de autenticação, scanner, email, alertas e cron exigem configuração externa. Vinext permanece beta: revise a maturidade do runtime na decisão de hospedagem comercial.
