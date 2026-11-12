'use client';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useResource, Message, api, safeReturnTo } from '../client';
import { Captcha } from './captcha';
export default function Account() {
  const { data: user, setData } = useResource('me');
  const { data: config } = useResource('config');
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [message, setMessage] = useState(''),
    [isError, setIsError] = useState(false),
    [busy, setBusy] = useState(false),
    [factor, setFactor] = useState<any>(null),
    [factorId, setFactorId] = useState('');
  async function action(path: string, data: unknown) {
    setBusy(true);
    setMessage('');
    setIsError(false);
    try {
      const r = await api('auth/' + path, data);
      setIsError(!!r.warning);
      setMessage(r.message || 'Concluído.');
      if (path === 'login' || path === 'mfa-verify') {
        setData(await api('me'));
        const next = safeReturnTo(new URLSearchParams(location.search).get('next'));
        if (next && (next !== '/admin' || path === 'mfa-verify')) location.assign(next);
      }
      if (path === 'logout' || path === 'mfa-verify') { setFactor(null); setFactorId(''); }
      if (path === 'logout') setData(null);
      return r;
    } catch (e: any) {
      setIsError(true);
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(
    event: React.SyntheticEvent<HTMLFormElement>,
    path: string,
  ) {
    event.preventDefault();
    await action(
      path,
      Object.fromEntries(new FormData(event.currentTarget).entries()),
    );
    setCaptchaAttempt(value => value + 1);
  }
  return (
    <div className="page narrow">
      <p className="eyebrow">BEM-VINDO À SUA BIBLIOTECA</p>
      <h1>Minha conta</h1>
      {config && !config.authReady && (
        <Message text="Cadastro e login aguardam configuração da loja." />
      )}
      {user ? (
        <div className="stack">
          <div className="panel stack">
            <p>
              Conectado como <strong>{user.email}</strong>.
            </p>
            <a className="button" href="/biblioteca">
              Meus ebooks
            </a>
            {user.admin && (
              <a className="text-link" href="/admin">
                Abrir administração
              </a>
            )}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => action('logout', {})}
            >
              Sair da conta
            </button>
          </div>
          <details className="panel">
            <summary>Segurança e segundo fator</summary>
            <p>
              Administradores precisam confirmar um código do autenticador para
              usar o painel.
            </p>
            <div className="stack">
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  const r = await action('mfa-list', {});
                  const active = r?.factors.find(
                    (f: any) => f.status === 'verified',
                  );
                  if (active) setFactorId(active.id);
                  else setMessage('Cadastre um autenticador primeiro.');
                }}
              >
                Usar meu autenticador
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  const r = await action('mfa-enroll', {});
                  if (r) {
                    setFactor(r);
                    setFactorId(r.id);
                  }
                }}
              >
                Cadastrar autenticador
              </button>
              {factor && (
                <>
                  <p>
                    Adicione esta chave no seu aplicativo autenticador e
                    guarde-a em local seguro:
                  </p>
                  <code style={{ overflowWrap: 'anywhere' }}>
                    {factor.secret}
                  </code>
                </>
              )}
              {factorId && (
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action('mfa-verify', {
                      factorId,
                      code: new FormData(e.currentTarget).get('code'),
                    });
                  }}
                >
                  <label>
                    Código de 6 dígitos
                    <input
                      name="code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      required
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    Confirmar segundo fator
                  </button>
                </form>
              )}
            </div>
          </details>
          <details className="panel">
            <summary>Meus dados pessoais</summary>
            <p>A loja avaliará obrigações de retenção antes da exclusão.</p>
            <div className="stack">
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    const r = await api('privacy/export', {});
                    const u = URL.createObjectURL(
                      new Blob([JSON.stringify(r, null, 2)], {
                        type: 'application/json',
                      }),
                    );
                    const a = document.createElement('a');
                    a.href = u;
                    a.download = 'meus-dados.json';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(u), 1000);
                  } catch (e: any) {
                    setMessage(e.message);
                  }
                }}
              >
                Exportar meus dados
              </button>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    const r = await api('privacy/request', { kind: 'delete' });
                    setMessage(r.message);
                  } catch (e: any) {
                    setMessage(e.message);
                  }
                }}
              >
                Solicitar exclusão dos meus dados
              </button>
            </div>
          </details>
        </div>
      ) : (
        <div className="panel">
          <Tabs defaultValue="login">
            <TabsList aria-label="Acesso à conta">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
              <TabsTrigger value="recover">Recuperar</TabsTrigger>
            </TabsList>
            {['login', 'signup', 'recover'].map((mode) => (
              <TabsContent key={mode} value={mode}>
                <form className="stack" onSubmit={(e) => submit(e, mode)}>
                  <h2>
                    {mode === 'login'
                      ? 'Que bom ter você aqui'
                      : mode === 'signup'
                        ? 'Sua próxima leitura começa aqui'
                        : 'Recuperar acesso'}
                  </h2>
                  <label>
                    Email
                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      maxLength={254}
                      required
                    />
                  </label>
                  {mode !== 'recover' && (
                    <label>
                      Senha{mode === 'signup' ? ' (mínimo 12 caracteres)' : ''}
                      <input
                        type="password"
                        name="password"
                        autoComplete={
                          mode === 'login' ? 'current-password' : 'new-password'
                        }
                        minLength={mode === 'signup' ? 12 : 1}
                        maxLength={128}
                        required
                      />
                    </label>
                  )}
                  {mode === 'signup' && (
                    <p className="muted">
                      Enviaremos um email para confirmar seu endereço. Leia os{' '}
                      <a href="/termos" className="text-link">
                        termos
                      </a>{' '}
                      e a{' '}
                      <a href="/privacidade" className="text-link">
                        política de privacidade
                      </a>
                      .
                    </p>
                  )}
                  {config?.captchaSiteKey && <Captcha key={config.captchaSiteKey + ':' + captchaAttempt} siteKey={config.captchaSiteKey} />}
                  <button
                    className="button"
                    disabled={busy || !config?.authReady}
                  >
                    {busy
                      ? 'Aguarde…'
                      : mode === 'login'
                        ? 'Entrar'
                        : mode === 'signup'
                          ? 'Criar conta'
                          : 'Enviar instruções'}
                  </button>
                </form>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
      <Message text={message} error={isError} />
    </div>
  );
}
