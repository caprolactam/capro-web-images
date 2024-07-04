import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { expect, test, describe, beforeAll } from 'vitest'
import app, { type Bindings } from './index'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Bindings {}
}

const images = [
  'test_avif.avif',
  // 'test_jpeg.jpeg', 'test_png.png', 'test_gif.gif'
]
const createImageUrl = (image: string) =>
  `https://raw.githubusercontent.com/caprolactam/capro-web-images/main/images/${image}`

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
  beforeAll(async () => {
    await Promise.all(
      images.map(async (image) => {
        const response = await fetch(createImageUrl(image)).then(
          async (res) => ({
            body: await res.arrayBuffer(),
            contentType: res.headers.get('content-type') ?? undefined,
          }),
        )
        return env.BUCKET.put(image, response.body, {
          httpMetadata: { contentType: response.contentType },
        })
      }),
    )
  })

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

  describe('get images', async () => {
    for (const image of images) {
      test(`image ${image}`, async () => {
        const request = new IncomingRequest(
          `http://localhost:8787/images/${image}`,
        )
        const ctx = createExecutionContext()
        const res = await app.fetch(request, env, ctx)
        // Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
        await waitOnExecutionContext(ctx)

        expect(res.status).toBe(200)
        expect(res.headers.get('cf-cache-status')).toBeNull()
      })
    }
  })

  describe('get images by cache', async () => {
    for (const image of images) {
      // test works properly, but file system throws error regardless of test result
      // Error: ENOTEMPTY: directory not empty, rmdir errno: -4051
      test.skip(`image ${image}`, async () => {
        const request = new IncomingRequest(
          `http://localhost:8787/images/${image}`,
        )
        // first request(Cache was empty)
        let ctx = createExecutionContext()
        let res = await app.fetch(request, env, ctx)
        // Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
        await waitOnExecutionContext(ctx)

        expect(res.status).toBe(200)
        expect(res.headers.get('cf-cache-status')).toBeNull()

        // second request(Cache was filled)
        ctx = createExecutionContext()
        res = await app.fetch(request, env, ctx)
        // Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
        await waitOnExecutionContext(ctx)

        expect(res.status).toBe(200)
        expect(res.headers.get('cf-cache-status')).toBe('HIT')
      })
    }
  })
})
