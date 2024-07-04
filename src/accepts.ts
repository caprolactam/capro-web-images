// This code is from https://github.com/honojs/hono/blob/main/src/helper/accepts/accepts.ts (Last visited: 2024-07-03)
// MIT License Copyright (c) 2021 - present, Yusuke Wada and Hono contributors
// modified code for my project

export type AcceptHeader = 'Accept'

export interface Accept {
  type: string
  params: Record<string, string>
  q: number
}

export const parseAccept = (acceptHeader: string): Accept[] => {
  // Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8
  const accepts = acceptHeader.split(',') // ['text/html', 'application/xhtml+xml', 'application/xml;q=0.9', 'image/webp', '*/*;q=0.8']
  return accepts.map((accept) => {
    const parts = accept.trim().split(';') // ['text/html', 'q=0.9', 'image/webp']
    const type = parts[0] // text/html
    const params = parts.slice(1) // ['q=0.9', 'image/webp']
    const q = params.find((param) => param.startsWith('q='))

    const paramsObject = params.reduce(
      (acc, param) => {
        const keyValue = param.split('=')
        const key = keyValue[0].trim()
        const value = keyValue[1].trim()
        acc[key] = value
        return acc
      },
      {} as { [key: string]: string },
    )

    return {
      type: type,
      params: paramsObject,
      q: q ? parseFloat(q.split('=')[1]) : 1,
    }
  })
}
