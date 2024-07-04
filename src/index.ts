import { Hono } from 'hono'
import { etag } from 'hono/etag'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { parseAccept, type Accept } from './accepts'

const allowedAccepts = ['*/*', 'image/*', 'image/avif'] as const

const isValidImageKey = (key: string) => {
  return /^[a-zA-Z0-9_\.-]+$/.test(key)
}

function matchAcceptContentType(
  accepts: Array<Accept>,
  contentType: string,
): boolean {
  return accepts.some(
    (accept) =>
      ['*/*', 'image/*'].includes(accept.type) || accept.type === contentType,
  )
}

export type Bindings = {
  BUCKET: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>()

// Hono disabled X-Powered-By by default.
app.use(trimTrailingSlash())

app.get('/images/:key', etag(), async (c) => {
  try {
    const url = new URL(c.req.url)
    const key = c.req.param('key')
    const acceptsInHeader = parseAccept(c.req.header('Accept') ?? '*/*').sort(
      (a, b) => b.q - a.q,
    )

    // check image key
    if (!isValidImageKey(key)) {
      return c.json({ message: 'Image key is invalid.' }, { status: 400 })
    }

    // check accept header
    const isSupported = acceptsInHeader.some((accept) =>
      allowedAccepts.includes(accept.type),
    )
    // if acceptsInHeader.length === 0, then client accept all content types.
    if (acceptsInHeader.length && !isSupported) {
      return c.json(
        {
          message: `The content type in the Accept header are not supported. Please specify a valid content type such as${allowedAccepts.map((accept) => ` '${accept}'`).toLocaleString()}.`,
        },
        406,
      )
    }

    const cache = caches.default
    const cacheKey = new Request(url.href)
    const cachedResponse = await cache.match(cacheKey)
    if (cachedResponse) {
      const contentType = cachedResponse.headers.get('content-type') || ''
      if (!matchAcceptContentType(acceptsInHeader, contentType)) {
        return c.json(
          {
            message: `Image does not match content type in the Accept header. Please specify a valid content type such as ${contentType}.`,
          },
          406,
        )
      }

      const response = new Response(cachedResponse.body, cachedResponse)

      return response
    }

    const imageObject = await c.env.BUCKET.get(key)

    if (!imageObject || !imageObject.httpMetadata?.contentType) {
      return c.json({ message: 'Image not found.' }, { status: 404 })
    }

    const { contentType } = imageObject.httpMetadata

    if (!matchAcceptContentType(acceptsInHeader, contentType)) {
      return c.json(
        {
          message: `Image does not match content type in the Accept header. Please specify a valid content type such as ${contentType}.`,
        },
        406,
      )
    }
    const response = new Response(imageObject.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: imageObject.etag,
      },
    })

    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))

    return response
  } catch {
    return c.json({ message: 'Internal server error.' }, { status: 500 })
  }
})

app.notFound((c) => {
  return c.text('Not found', 404)
})

export default app
