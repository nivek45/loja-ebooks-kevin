# Relatório de validação

Última verificação: 19/09/2026. Sem credenciais reais de pagamento ou autenticação. Veja [a etapa de autenticação](ETAPA-AUTENTICACAO.md) e `testes-etapa-autenticacao.txt`. O widget CAPTCHA está implementado, mas sua execução real e ativação no Supabase continuam pendentes.

Veja [correções da auditoria](CORRECOES-SEGURANCA.md) e a saída em testes-correcao-seguranca.txt. Os testes permanentes agora exigem saída local mesmo com falha de revogação, banco indisponível, timeout e limite esgotado; cookies usam SameSite=Strict.

## Executado

| Verificação | Resultado | Alcance |
|---|---|---|
| `npm test` | 65 testes passaram, 0 falhas | API real da aplicação com D1/R2 locais em Miniflare, cliente HTTP e provedores substituídos por fixtures; inclui CAPTCHA, MFA, recuperação e retentativa de alertas |
| `npm run typecheck` | Passou | TypeScript da aplicação e scaffold |
| `npm run build` | Passou | Bundle Worker e todas as rotas de cliente/servidor |
| Migração inicial | Aplicada no D1 local | 17 comandos executados pelo Wrangler; banco de desenvolvimento |
| `npm audit` após atualizações | Zero vulnerabilidades conhecidas no momento da análise | Dependências principais e de desenvolvimento; não é pentest |
| Audit do scanner | Zero vulnerabilidades conhecidas | Lockfile npm do scanner, não a imagem Linux/ClamAV |
| Lint da aplicação | 0 erros; 42 avisos `any` | `app`, `server`, `db` e middleware; componentes de scaffold não modificados fora deste escopo |
| Varredura de fonte/build | Passou | Assets de cliente; sem nomes de segredos de servidor/payload cifrado, sem PDF ou banco em `public/` |
| HTTP local | 200 na página, catálogo e config | Config confirma `salesEnabled=false`, `authReady=false`, modo teste |
| Navegação em navegador | Conferida | Inicial, conta, aba de recuperação, biblioteca e administração sem sessão; bloqueios visíveis |
| WebMCP | Registro e duas rejeições conferidas | Consulta sem sessão e entrada com campo indevido recusadas; sucesso autenticado pendente |
| Restauração local | Passou | Dados exportados do D1 local para SQLite isolado; integridade e relações válidas; cópia R2 local com SHA-256 coincidente |

O linter inicial do scaffold encontrou também alertas de componentes de terceiros. O comando final foi limitado ao código de aplicação. As sugestões de usar navegação/otimização de imagem do Next foram desativadas por decisão de arquitetura; os 42 avisos de tipos dinâmicos permanecem. Não se afirma que todo o scaffold é livre de avisos.

## Casos cobertos pelos testes

- Alteração de preço/status na requisição é rejeitada; a cobrança legítima usa o preço do banco e guarda o valor anterior a alterações de catálogo.
- Outro cliente não lê, reconcilia ou baixa pedidos; não recebe pedidos alheios na listagem.
- Todas as ações administrativas disponíveis recusam usuário comum, mesmo com nível MFA declarado no fixture. Administrador autorizado sem MFA é recusado.
- Webhook com assinatura falsa não consulta o provedor nem libera arquivo.
- Pagamentos com valor, BRL, recebedor, ambiente, referência, metadata, método ou ID incompatíveis são recusados.
- Eventos duplicados não duplicam registros/entrega. Criações repetidas e paralelas preservam um pedido por chave de tentativa.
- Pendência, expiração e cancelamento não liberam download.
- Pagamento aprovado permite download autenticado; token é de uso único, expira e não funciona em outra conta.
- Reembolso invalida links já emitidos e impede que aprovação antiga restaure acesso; empate de timestamp favorece revogação.
- Cancelamento mais recente após aprovação revoga o acesso.
- Falha do provedor não marca pedido como pago e permite retentativa com o pedido original.
- Origem externa é recusada; dados internos do pedido não são retornados.
- Cotas de download persistem no banco; scanner ausente bloqueia upload.
- Ausência de sessão bloqueia a rota real de entrega.
- Contrato HTTP do SDK Supabase para cadastro, login, recuperação, confirmação e logout: cookies HttpOnly/Secure/SameSite e mensagens neutras.

**Distinção essencial:** os testes de autenticação e pagamento substituem as respostas externas. O fluxo de pagamento → webhook → download foi exercitado com fixtures. Nenhum desses testes é uma compra Pix real. O teste de ausência de sessão não equivale a um teste completo de falsificação criptográfica de JWT.

## Não executado / obrigatório antes de vender

- Cadastro/login/recuperação com projeto Supabase, email transacional real e MFA real; revogação, rotação e recuperação de conta administrativa.
- Compra Pix no ambiente de homologação do Mercado Pago, com credenciais da conta escolhida, QR válido e webhook oficial recebido através do domínio final.
- Compra real controlada em produção, conta recebedora correta, valor esperado, evento, biblioteca, PDF e reembolso.
- Fluxo completo autenticado no navegador com esses serviços. O teste HTTP de contrato não substitui esse aceite.
- Upload real e inspeção ClamAV/qpdf em container, EICAR, PDF malicioso, atualização de assinaturas, timeout e isolamento. Docker/ClamAV não estavam disponíveis.
- Cópia e restauração reais de D1/R2/Supabase, cofre de segredos e retomada de tráfego. A função D1.dump não é suportada pelo ambiente local; o ensaio usou exportação de fixtures.
- Entrega real de alertas, execução recorrente da manutenção e monitoramento de ausência do job.
- Revisão de acessibilidade com leitor de tela e verificação completa em dispositivos móveis; testes de carga, DDoS, pentest e auditoria independente.
- Inspeção de vulnerabilidades da imagem de container e sistema operacional; auditoria npm cobre somente pacotes JavaScript.
- Revisão jurídica, dados reais do vendedor, retenção, operadores, direitos autorais e condições de reembolso.

## Aceite externo recomendado

1. Em teste, criar duas contas, confirmar emails e exercitar a recuperação, inclusive para email inexistente.
2. Criar o administrador pelo procedimento operacional e verificar recusa sem TOTP.
3. Enviar arquivos válidos e inválidos; publicar um ebook próprio de teste.
4. Criar Pix, conferir valor no painel, pagar conforme o procedimento oficial do ambiente e verificar assinatura/evento.
5. Tentar acessar o pedido e seu link na segunda conta; testar link vencido e repetido.
6. Reembolsar pelo provedor e verificar bloqueio de novos downloads.
7. Parar o provedor/scanner/cron em ambiente isolado e conferir falhas, alertas e recuperação.
8. Restaurar backups em ambiente novo e comparar registros, identidades e hashes dos objetos.
9. Repetir uma compra real de baixo valor, autorizada pelo responsável, após ativar produção.

A publicação de uma prévia com vendas desativadas não conclui este aceite comercial.
