'use client';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  api,
  useResource,
  Waiting,
  Message,
  money,
  statuses,
  date,
  accountLink,
} from '../client';
const blank = {
  title: '',
  description: '',
  price: '',
  published: false,
  coverId: null as string | null,
  fileId: null as string | null,
  id: undefined as string | undefined,
};
export default function Admin() {
  const { data: user, error } = useResource('me');
  const authorized = !!user?.admin && user.aal === 'aal2';
  const {
    data: products,
    setData: setProducts,
    error: productError,
  } = useResource('admin/products', authorized);
  const { data: orders, setData: setOrders, error: orderError } = useResource('admin/orders', authorized);
  const { data: log, error: logError } = useResource('admin/audit', authorized);
  const { data: readiness, error: readinessError } = useResource('admin/readiness', authorized);
  const [edit, setEdit] = useState(blank),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function sendFile(file: File | undefined, kind: string) {
    if (!file) return;
    const max = (kind === 'cover' ? 2 : 20) * 1024 * 1024;
    if (file.size > max) { setMessage('Arquivo acima do limite. Escolha um arquivo menor.'); return; }
    setBusy(true);
    try {
      const r = await api('admin/upload?kind=' + kind, undefined, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      });
      setEdit((p) => ({
        ...p,
        [kind === 'cover' ? 'coverId' : 'fileId']: r.id,
      }));
      setMessage('Arquivo verificado e armazenado.');
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!/^\d+(?:[,.]\d{1,2})?$/.test(edit.price))
        throw new Error(
          'Informe o preço em reais, com até duas casas decimais.',
        );
      await api('admin/products', {
        ...edit,
        price: Math.round(Number(edit.price.replace(',', '.')) * 100),
      });
      setProducts(await api('admin/products'));
      setEdit(blank);
      setMessage('Ebook salvo.');
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!user)
    return (
      <div className="page">
        <h1>Administração</h1>
        <Waiting error={error} returnTo="/admin" />
      </div>
    );
  if (!user.admin || user.aal !== 'aal2')
    return (
      <div className="page narrow">
        <h1>Acesso restrito</h1>
        <p>
          Esta área exige uma conta autorizada e autenticação com segundo fator.
        </p>
        <a className="button" href={accountLink('/admin')}>
          Confirmar minha conta e segundo fator
        </a>
      </div>
    );
  return (
    <div className="page">
      <p className="eyebrow">PAINEL DA LOJA</p>
      <h1>Administração</h1>
      <Message text={message} />
      <Tabs defaultValue="products">
        <TabsList aria-label="Painel administrativo">
          <TabsTrigger value="products">Ebooks</TabsTrigger>
          <TabsTrigger value="orders">Vendas</TabsTrigger>
          <TabsTrigger value="audit">Registros</TabsTrigger>
          <TabsTrigger value="setup">Configuração</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <div className="split">
            <div className="stack">
              <h2>Seus ebooks</h2>
              {products ? (
                products.products.length ? (
                  products.products.map((p: any) => (
                    <article className="panel" key={p.id}>
                      <span className="badge">
                        {p.published ? 'Publicado' : 'Desativado / rascunho'}
                      </span>
                      <h3>{p.title}</h3>
                      <p>{money(p.price)}</p>
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() =>
                          setEdit({
                            id: p.id,
                            title: p.title,
                            description: p.description,
                            price: (p.price / 100).toFixed(2),
                            published: !!p.published,
                            coverId: p.cover_id,
                            fileId: p.file_id,
                          })
                        }
                      >
                        Editar ebook
                      </button>
                    </article>
                  ))
                ) : (
                  <p>Nenhum ebook cadastrado.</p>
                )
              ) : (
                <Waiting error={productError} />
              )}
            </div>
            <form className="panel stack" onSubmit={save}>
              <fieldset className="stack form-fields" disabled={busy}>
              <h2>{edit.id ? 'Editar ebook' : 'Novo ebook'}</h2>
              <label>
                Título
                <input
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                  minLength={3}
                  maxLength={140}
                  required
                />
              </label>
              <label>
                Descrição
                <textarea
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                  minLength={20}
                  maxLength={10000}
                  required
                />
              </label>
              <label>
                Preço em reais
                <input
                  value={edit.price}
                  onChange={(e) => setEdit({ ...edit, price: e.target.value })}
                  inputMode="decimal"
                  placeholder="29,90"
                  required
                />
              </label>
              <label>
                Capa · PNG ou JPEG · até 2 MB
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={busy}
                  onChange={(e) => sendFile(e.target.files?.[0], 'cover')}
                />
              </label>
              {edit.coverId && (
                <p className="muted">Capa aprovada e vinculada.</p>
              )}
              <label>
                Ebook · PDF · até 20 MB
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={busy}
                  onChange={(e) => sendFile(e.target.files?.[0], 'ebook')}
                />
              </label>
              {edit.fileId && (
                <p className="muted">PDF aprovado e vinculado.</p>
              )}
              <label className="row" htmlFor="published">
                <Switch
                  id="published"
                  checked={edit.published}
                  onCheckedChange={(v) => setEdit({ ...edit, published: v })}
                  aria-label="Disponível no catálogo"
                />
                Disponível no catálogo
              </label>
              <button className="button" disabled={busy}>
                {busy ? 'Aguarde a verificação…' : 'Salvar ebook'}
              </button>
              {edit.id && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEdit(blank)}
                >
                  Cadastrar outro ebook
                </button>
              )}
              </fieldset>
            </form>
          </div>
        </TabsContent>
        <TabsContent value="orders">
          {!orders && <Waiting error={orderError} />}
          {orders?.orders.length === 0 && <p>Nenhum pedido registrado.</p>}
          <h2>Vendas aprovadas: {money(orders?.sales?.total || 0)}</h2>
          <p>
            {orders?.sales?.count || 0} pedidos aprovados no ambiente
            configurado.
          </p>
          <Table className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead>Ebook</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders?.orders.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell>
                    {o.title}
                    <small className="muted" style={{ display: 'block' }}>
                      Pedido {o.id.slice(0, 8)} ·{' '}
                      {o.mode === 'test' ? 'Teste' : 'Produção'}
                    </small>
                  </TableCell>
                  <TableCell>{statuses[o.status]}</TableCell>
                  <TableCell>{money(o.amount)}</TableCell>
                  <TableCell>{date(o.created_at)}</TableCell>
                  <TableCell>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api('admin/reconcile', { id: o.id });
                          setOrders(await api('admin/orders'));
                          setMessage('Pagamento consultado.');
                        } catch (e: any) {
                          setMessage(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Consultar pagamento
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="muted">
            Reembolsos são realizados no painel do Mercado Pago. A loja revoga
            novos downloads quando o reembolso é confirmado.
          </p>
        </TabsContent>
        <TabsContent value="audit">
          {!log && <Waiting error={logError} />}
          <h2>Histórico administrativo</h2>
          {log?.audit.map((a: any) => (
            <p key={a.id}>
              {date(a.created_at)} · {a.action} · {a.target}
              <br />
              <small>{a.detail}</small>
            </p>
          ))}
          <h2>Alertas operacionais</h2>
          {log?.alerts.map((a: any) => (
            <p key={a.id}>
              {date(a.created_at)} · {a.kind} ·{' '}
              {a.target || 'Sem identificador'} ·{' '}
              {a.sent_at ? 'Enviado' : 'Aguardando envio'}
            </p>
          ))}
          <h2>Solicitações de dados</h2>
          {log?.privacyRequests.map((r: any) => (
            <p key={r.id}>
              {r.id} · {r.kind} · {date(r.created_at)}
            </p>
          ))}
        </TabsContent>
        <TabsContent value="setup">
          <h2>Preparação para as vendas</h2>
          {!readiness ? <Waiting error={readinessError} /> : <div className="panel stack">
            <p>{readiness.salesEnabled ? 'Vendas habilitadas' : 'Vendas desativadas'} · {readiness.mode === 'production' ? 'Produção' : 'Teste'}</p>
            <ul>{readiness.checks.map((check: {label: string; configured: boolean}) => <li key={check.label}>{check.label}: <strong>{check.configured ? 'Configuração presente' : 'Pendente'}</strong></li>)}</ul>
            <p>A presença das configurações não comprova que os serviços funcionam. Antes de abrir as vendas, valide email, segundo fator, upload, pagamento, download, reembolso, alertas e restauração de backup.</p>
          </div>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
