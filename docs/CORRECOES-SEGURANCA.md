# Correções da auditoria — 18/09/2026

## Implementado

- **V1:** o logout passa antes do limitador de login e da leitura de formulários. A revogação remota tem cota separada de 10 solicitações/IP/minuto; esgotá-la não impede limpar os cookies. A validação CSRF permanece no roteador antes do logout.
- **V2:** o retorno de `signOut` é conferido. Confirmação do provedor retorna 200 e `remoteRevoked=true`; falha retorna 202, `localSignedOut=true`, `remoteRevoked=false` e aviso explícito. Não se apresenta sucesso global quando apenas a saída local ocorreu.
- O mesmo tratamento é usado depois de alterar a senha. Se a senha mudou e a revogação falhou, a mensagem informa os dois resultados corretamente.
- Falhas de revogação geram alertas `logout_revocation_failed` ou `password_revocation_failed`, sem tokens/senhas. Se o banco de alertas falhar, um evento genérico é registrado e os cookies ainda são limpos.
- Espera pelo provedor limitada a 10 segundos na etapa remota de logout; as requisições do cliente específico de logout são abortadas no encerramento. Indisponibilidade completa da hospedagem continua fora da capacidade do código.
- Cookies HTTPS agora usam `SameSite=Strict`, além de HttpOnly, Secure, Path=/ e prefixo __Host-. A limpeza preserva os mesmos atributos.
- Cookies com escape inválido não causam erro interno de decodificação.
- Testes da auditoria incorporados à suíte permanente. Os dois testes que reproduziam falhas agora exigem limpeza local e tratamento explícito da falha remota.

## Política de retentativa e limites

Não armazenamos access/refresh tokens numa fila para revogação futura. Após saída parcial, a mensagem orienta autenticar novamente e repetir a saída global; o operador acompanha o alerta. Isso evita persistir novas cópias de credenciais sensíveis. O envio externo de alertas exige configurar o receptor e a manutenção.

A confirmação do endpoint de logout não prova, sozinha, invalidação instantânea de todo JWT já emitido. Duração, sessão remota, verificação por getUser/getClaims e eventual necessidade de controle adicional de revogação precisam ser homologadas no Supabase real. Não foi implementado um sistema próprio de autenticação.

## Dependências externas que permanecem pendentes

Cadastro Supabase, SMTP, parâmetros de senha/expiração, chaves reais e MFA; testes reais de timing, links expirados/reutilizados, replay após logout e troca de senha. Também é necessário verificar a navegação por links de email com SameSite=Strict no navegador real.

CAPTCHA, token CSRF dedicado e lockout permanente não eram vulnerabilidades demonstradas. Foram preservados limites por conta/IP, Origin exato, Fetch Metadata e mensagens neutras. Não se afirma que atraso artificial torne tempos de resposta idênticos. Configurações de infraestrutura, scanner, backups e serviços Pix também não podem ser homologadas sem suas contas/credenciais.

Mantenha vendas desativadas até concluir os passos de OPERACAO.md. A auditoria original é histórica; este documento registra as correções posteriores.

## Resultado da validação

60 testes passaram, zero falhas, incluindo timeout de revogação. TypeScript, build e varredura de assets aprovados. Lint sem erros e com 42 avisos de tipos dinâmicos. Os testes usam serviços externos controlados, não contas reais.
