'use client';
import { useEffect, useState } from 'react';
import { api, Message } from '../../client';
export default function Confirm() {
  const [token, setToken] = useState(''),
    [type, setType] = useState(''),
    [verified, setVerified] = useState(false),
    [passwordChanged, setPasswordChanged] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    queueMicrotask(() => {
      setToken(p.get('token_hash') || '');
      setType(p.get('type') || '');
    });
    history.replaceState(null, '', '/conta/confirmar');
  }, []);
  async function verify() {
    setBusy(true);
    try {
      const r = await api('auth/verify', { token_hash: token, type });
      setVerified(true);
      setToken('');
      setMessage(
        r.type === 'recovery'
          ? 'Defina sua nova senha.'
          : 'Email confirmado. Você pode acessar sua biblioteca.',
      );
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page narrow">
      <h1>Confirmar acesso</h1>
      <div className="panel stack">
        {!verified ? (
          <>
            <p>
              Confirme seu acesso para continuar na loja.
            </p>
            <button
              className="button"
              disabled={!token || busy}
              onClick={verify}
            >
              {busy ? 'Confirmando…' : type === 'recovery' ? 'Recuperar meu acesso' : 'Confirmar meu email'}
            </button>
            {!token && <p>Abra o link recebido por email para continuar.</p>}
          </>
        ) : type === 'recovery' && !passwordChanged ? (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await api('auth/password', {
                  password: new FormData(e.currentTarget).get('password'),
                });
                setMessage(r.message);
                setPasswordChanged(true);
              } catch (e: any) {
                setMessage(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Nova senha (mínimo 12 caracteres)
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <button className="button" disabled={busy}>
              Salvar nova senha
            </button>
          </form>
        ) : !passwordChanged ? (
          <a className="button" href="/biblioteca">
            Ir para minha biblioteca
          </a>
        ) : null}
        <Message text={message} />
        <a className="text-link" href="/conta">
          Ir para minha conta
        </a>
      </div>
    </div>
  );
}
