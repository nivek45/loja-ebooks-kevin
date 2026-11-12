import { env } from 'cloudflare:workers';
// Rota única da API: encaminha todos os métodos HTTP ao roteador do servidor.
import { handle } from '../../../server/router';
import type { Env } from '../../../server/base';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handle(request, env as unknown as Env);
export const POST = (request: Request) =>
  handle(request, env as unknown as Env);
export const PUT = (request: Request) => handle(request, env as unknown as Env);
export const DELETE = (request: Request) =>
  handle(request, env as unknown as Env);
export const PATCH = (request: Request) =>
  handle(request, env as unknown as Env);
