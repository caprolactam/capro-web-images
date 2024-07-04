import { Hono } from 'hono'
import { etag } from 'hono/etag'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { optimizeImage } from 'wasm-image-optimization'
import { parseAccept, type Accept } from './accepts'

const allowedAccepts = [
  '*/*',
  'image/*',
  'image/webp',
  'image/jpeg',
  'image/png',
  'image/gif',
] as const

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

  // modify url and check cache
  // NOTE: type is not correct, so casting. rewrite when fixing it.
  const {
    q: quality,
    w: width,
    h: height,
  } = c.req.query() as Record<string, string | undefined>
  const searchParams = new URLSearchParams()
  // init query
  for (const key of url.searchParams.keys()) {
    url.searchParams.delete(key)
  }
  quality && searchParams.set('q', quality)
  height && searchParams.set('h', height)
  width && searchParams.set('w', width)

  const isWebp =
    acceptsInHeader.length === 0 ||
    ['*/*', 'image/*', 'image/webp'].includes(acceptsInHeader[0].type)
  isWebp && searchParams.set('webp', isWebp.toString())

  const cache = caches.default
  const cacheKey = new Request(url.toString())
  const cachedResponse = await cache.match(cacheKey)
  if (cachedResponse) {
    return cachedResponse
  }

  const imageObject = await c.env.BUCKET.get(key)

  if (!imageObject || !imageObject.httpMetadata?.contentType) {
    return c.json({ message: 'Image not found.' }, { status: 404 })
  }

  const { contentType } = imageObject.httpMetadata

  if (
    !isWebp &&
    contentType === 'image/gif' &&
    matchAcceptContentType(acceptsInHeader, contentType)
  ) {
    const response = new Response(imageObject.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: imageObject.etag,
      },
    })

    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))

    return response
  }

  const acceptsExceptWebp = acceptsInHeader.filter(
    (accept) => !['*/*', 'image/*', 'image/webp'].includes(accept.type),
  )

  if (
    (!isWebp && !acceptsExceptWebp.length) ||
    (!isWebp && acceptsExceptWebp[0].type === 'image/gif')
  ) {
    return c.json(
      {
        message: `The content type in the Accept header are not supported. Please specify a valid content type such as${allowedAccepts.map((accept) => ` '${accept}'`).toLocaleString()}.`,
      },
      406,
    )
  }

  let format: 'webp' | 'jpeg' | 'png'
  if (isWebp) {
    format = 'webp'
  } else if (acceptsExceptWebp[0].type === 'image/jpeg') {
    format = 'jpeg'
  } else if (acceptsExceptWebp[0].type === 'image/png') {
    format = 'png'
  } else {
    format = 'webp'
  }

  const image = await optimizeImage({
    image: await imageObject.arrayBuffer(),
    height: height ? parseInt(height) : undefined,
    width: width ? parseInt(width) : undefined,
    quality: quality ? parseInt(quality) : undefined,
    format,
  })

  const response = new Response(image, {
    headers: {
      'Content-Type': `image/${format}`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })

  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
})

app.notFound((c) => {
  return c.text('Not found', 404)
})

export default app
