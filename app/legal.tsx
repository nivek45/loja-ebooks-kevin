'use client';
import { useResource, Waiting } from './client';
export default function Legal({
  kind,
}: {
  kind: 'contato' | 'termos' | 'privacidade';
}) {
  const { data: c, error } = useResource('config');
  const title = {
    contato: 'Fale com a loja',
    termos: 'Termos de compra',
    privacidade: 'Sua privacidade',
  }[kind];
  const l = c?.legal;
  return (
    <div className="page prose">
      <p className="eyebrow">INFORMAÇÕES DA LOJA</p>
      <h1>{title}</h1>
      {!c ? (
        <Waiting error={error} />
      ) : (
        <>
          {!l.reviewed && (
            <p className="message">
              Informações em preparação. Os dados do responsável e as condições
              comerciais precisam ser preenchidos e revisados antes das vendas.
            </p>
          )}
          <h2>Responsável pela loja</h2>
          <p>
            Nome: {l.name || '[NOME / RAZÃO SOCIAL A PREENCHER]'}
            <br />
            CPF / CNPJ: {l.document || '[DOCUMENTO A PREENCHER]'}
            <br />
            Endereço: {l.address || '[ENDEREÇO A PREENCHER]'}
            <br />
            Contato:{' '}
            {l.email ? (
              <a href={'mailto:' + l.email} className="text-link">
                {l.email}
              </a>
            ) : (
              '[EMAIL DE ATENDIMENTO A PREENCHER]'
            )}
          </p>
          {kind === 'contato' && (
            <>
              <h2>Como podemos ajudar?</h2>
              <p>
                Para falar sobre sua compra, informe o identificador do pedido e
                uma descrição do problema. Não envie sua senha, códigos de
                autenticação ou dados bancários.
              </p>
              <p>Horário e prazo de atendimento: [PREENCHER].</p>
            </>
          )}
          {kind === 'termos' && (
            <>
              <h2>Compra e acesso</h2>
              <p>
                O catálogo informa o título, a descrição e o preço de cada ebook
                em reais. Os arquivos são fornecidos em PDF. A compra exige uma
                conta com email confirmado.
              </p>
              <p>
                O pagamento é feito por Pix, por meio do Mercado Pago. A entrega
                ocorre na área Meus ebooks após a confirmação do pagamento pelo
                provedor.
              </p>
              <h2>Uso dos arquivos</h2>
              <p>
                Licença de uso, restrições e titularidade dos direitos:
                [PREENCHER DE ACORDO COM OS PRODUTOS E DIREITOS QUE O VENDEDOR
                POSSUI].
              </p>
              <h2>Cancelamentos, atendimento e reembolso</h2>
              <p>
                Política de arrependimento, prazos, condições, canal de
                solicitação e procedimento de reembolso: [PREENCHER E REVISAR
                CONFORME A LEGISLAÇÃO APLICÁVEL].
              </p>
              <p>
                Após a confirmação de reembolso, inclusive parcial, novos
                downloads do pedido são bloqueados. Arquivos já baixados não
                podem ser apagados do dispositivo do comprador pela loja.
              </p>
              <h2>Disponibilidade</h2>
              <p>
                Prazo de manutenção do acesso aos arquivos e condições de
                suporte: [PREENCHER]. A confirmação pode sofrer atrasos por
                indisponibilidade do provedor. Use Consultar pagamento na página
                do pedido.
              </p>
            </>
          )}
          {kind === 'privacidade' && (
            <>
              <h2>Dados utilizados</h2>
              <p>
                A aplicação utiliza email, identificador da conta, registros de
                pedidos, pagamentos e solicitações de atendimento. O CPF
                informado no checkout é enviado ao provedor e armazenado de
                forma cifrada apenas durante a tentativa de cobrança; a rotina
                de manutenção remove o conteúdo restante após a janela
                operacional.
              </p>
              <p>
                As senhas são processadas pelo serviço Supabase Auth. A
                aplicação não mantém uma tabela de senhas. Os cookies de sessão
                são usados para autenticação. O código desta loja não inclui
                publicidade ou ferramentas opcionais de análise. Os serviços de
                hospedagem e autenticação também podem manter registros técnicos,
                conforme suas políticas e configurações.
              </p>
              <h2>Serviços envolvidos</h2>
              <p>
                Supabase: autenticação; Cloudflare: hospedagem, banco e
                armazenamento; Mercado Pago: processamento de pagamentos. O
                serviço de verificação de arquivos recebe os documentos enviados
                pelo administrador. Regiões, operadores e transferências
                internacionais: [VALIDAR E PREENCHER CONFORME CONTRATOS E
                CONFIGURAÇÃO].
              </p>
              <h2>Seus direitos e solicitações</h2>
              <p>
                Na área Minha conta você pode exportar seus dados e solicitar
                exclusão. Correções e informações adicionais podem ser
                solicitadas pelo canal de contato. O responsável deverá avaliar
                a solicitação, verificar a identidade e observar eventuais
                deveres de retenção.
              </p>
              <h2>Informações pendentes</h2>
              <p>
                Bases legais, finalidades detalhadas, prazos de retenção por
                categoria, encarregado ou canal responsável, procedimentos de
                incidente e data de atualização: [PREENCHER E REVISAR].
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
