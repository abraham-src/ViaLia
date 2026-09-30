import type { WsControlMessage } from '@simu/shared-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectWs,
  createTestApp,
  hasTestDb,
  isControl,
  tokensFor,
  type DemoRole,
  type TestContext,
} from './helpers.js';

describe.skipIf(!hasTestDb)('websocket /ws', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
  });
  afterAll(async () => t?.close());

  it('refuses the upgrade without a valid token', async () => {
    await expect(t.app.injectWS('/ws')).rejects.toThrow(/401/);
    await expect(t.app.injectWS('/ws?token=not-a-jwt')).rejects.toThrow(/401/);
  });

  it('greets with the channels the role may use', async () => {
    const op = await connectWs(t.app, tok.operator);
    const welcome = (await op.next(isControl('welcome'))) as Extract<
      WsControlMessage,
      { type: 'welcome' }
    >;
    expect(welcome.allowed_channels).toHaveLength(6);
    op.close();

    const cit = await connectWs(t.app, tok.citizen);
    const w2 = (await cit.next(isControl('welcome'))) as Extract<
      WsControlMessage,
      { type: 'welcome' }
    >;
    expect(w2.allowed_channels).toEqual(['incidents', 'alerts']);
    cit.close();
  });

  it('subscribes, unsubscribes and answers pings', async () => {
    const c = await connectWs(t.app, tok.operator);
    c.ws.send(JSON.stringify({ subscribe: 'heartbeats' }));
    expect(await c.next(isControl('subscribed'))).toMatchObject({ channel: 'heartbeats' });
    c.ws.send(JSON.stringify({ unsubscribe: 'heartbeats' }));
    expect(await c.next(isControl('unsubscribed'))).toMatchObject({ channel: 'heartbeats' });
    c.ws.send(JSON.stringify({ ping: true }));
    await c.next(isControl('pong'));
    c.close();
  });

  it('rejects unknown channels, bad JSON and channels outside the role', async () => {
    const c = await connectWs(t.app, tok.citizen);
    c.ws.send('not json');
    expect(await c.next(isControl('error'))).toMatchObject({
      message: expect.stringMatching(/JSON/),
    });
    c.ws.send(JSON.stringify({ subscribe: 'everything' }));
    await c.next(isControl('error'));
    c.ws.send(JSON.stringify({ subscribe: 'devices:status' }));
    expect(await c.next(isControl('error'))).toMatchObject({
      message: expect.stringMatching(/rol/),
    });
    c.close();
  });
});
