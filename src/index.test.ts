import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { expect, test, describe } from 'vitest'
import app, { type Bindings } from './index'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Bindings {}
}

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>

describe('Not found routes', () => {
  const routes = ['/', '/images', '/foo']

  for (const route of routes) {
    test(`${route} is not found.`, async () => {
      const res = await app.request('/', {
        method: 'GET',
      })

      expect(res.status).toBe(404)
    })
  }
})

describe('Get image route', async () => {
  test('error Invalid image key.', async () => {
    const request = new IncomingRequest(
      'http://localhost:8787/images/>_is_invalid',
    )
    const ctx = createExecutionContext()
    const res = await app.fetch(request, env, ctx)
    // Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      message: expect.stringMatching(/invalid/i),
    })
  })

  test('error content type not supported in the Accept header', async () => {
    const request = new IncomingRequest('http://localhost:8787/images/foo', {
      headers: {
        accept: 'application/json',
      },
    })
    const ctx = createExecutionContext()
    const res = await app.fetch(request, env, ctx)
    // Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(406)
    expect(await res.json()).toEqual({
      message: expect.stringMatching(/not supported/i),
    })
  })
})
