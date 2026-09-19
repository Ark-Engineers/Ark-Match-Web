export function md5Hex(input: string): string {
  function rol(n: number, c: number): number {
    return (n << c) | (n >>> (32 - c))
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return (rol((a + q + x + t) | 0, s) + b) | 0
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & c) | (~b & d), a, b, x, s, t)
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & d) | (c & ~d), a, b, x, s, t)
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(b ^ c ^ d, a, b, x, s, t)
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(c ^ (b | ~d), a, b, x, s, t)
  }
  function toBytes(str: string): Uint8Array {
    return new TextEncoder().encode(str)
  }
  function bytesToWords(bytes: Uint8Array): number[] {
    const out: number[] = []
    for (let i = 0; i < bytes.length; i += 1) {
      out[i >> 2] = (out[i >> 2] || 0) | (bytes[i]! << ((i % 4) * 8))
    }
    return out
  }
  function wordsToHex(words: number[]): string {
    let out = ''
    for (let i = 0; i < words.length * 4; i += 1) {
      const b = (words[i >> 2]! >>> ((i % 4) * 8)) & 0xff
      out += b.toString(16).padStart(2, '0')
    }
    return out
  }
  const bytes = toBytes(input)
  const origLen = bytes.length
  const withOne = new Uint8Array(((origLen + 9 + 63) >> 6) << 6)
  withOne.set(bytes, 0)
  withOne[origLen] = 0x80
  const bitLen = origLen * 8
  const view = new DataView(withOne.buffer)
  view.setUint32(withOne.length - 8, bitLen >>> 0, true)
  view.setUint32(withOne.length - 4, Math.floor(bitLen / 0x100000000) >>> 0, true)
  const x = bytesToWords(withOne)
  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476
  for (let i = 0; i < x.length; i += 16) {
    const oa = a
    const ob = b
    const oc = c
    const od = d
    a = ff(a, b, c, d, x[i + 0] || 0, 7, -680876936)
    d = ff(d, a, b, c, x[i + 1] || 0, 12, -389564586)
    c = ff(c, d, a, b, x[i + 2] || 0, 17, 606105819)
    b = ff(b, c, d, a, x[i + 3] || 0, 22, -1044525330)
    a = ff(a, b, c, d, x[i + 4] || 0, 7, -176418897)
    d = ff(d, a, b, c, x[i + 5] || 0, 12, 1200080426)
    c = ff(c, d, a, b, x[i + 6] || 0, 17, -1473231341)
    b = ff(b, c, d, a, x[i + 7] || 0, 22, -45705983)
    a = ff(a, b, c, d, x[i + 8] || 0, 7, 1770035416)
    d = ff(d, a, b, c, x[i + 9] || 0, 12, -1958414417)
    c = ff(c, d, a, b, x[i + 10] || 0, 17, -42063)
    b = ff(b, c, d, a, x[i + 11] || 0, 22, -1990404162)
    a = ff(a, b, c, d, x[i + 12] || 0, 7, 1804603682)
    d = ff(d, a, b, c, x[i + 13] || 0, 12, -40341101)
    c = ff(c, d, a, b, x[i + 14] || 0, 17, -1502002290)
    b = ff(b, c, d, a, x[i + 15] || 0, 22, 1236535329)
    a = gg(a, b, c, d, x[i + 1] || 0, 5, -165796510)
    d = gg(d, a, b, c, x[i + 6] || 0, 9, -1069501632)
    c = gg(c, d, a, b, x[i + 11] || 0, 14, 643717713)
    b = gg(b, c, d, a, x[i + 0] || 0, 20, -373897302)
    a = gg(a, b, c, d, x[i + 5] || 0, 5, -701558691)
    d = gg(d, a, b, c, x[i + 10] || 0, 9, 38016083)
    c = gg(c, d, a, b, x[i + 15] || 0, 14, -660478335)
    b = gg(b, c, d, a, x[i + 4] || 0, 20, -405537848)
    a = gg(a, b, c, d, x[i + 9] || 0, 5, 568446438)
    d = gg(d, a, b, c, x[i + 14] || 0, 9, -1019803690)
    c = gg(c, d, a, b, x[i + 3] || 0, 14, -187363961)
    b = gg(b, c, d, a, x[i + 8] || 0, 20, 1163531501)
    a = gg(a, b, c, d, x[i + 13] || 0, 5, -1444681467)
    d = gg(d, a, b, c, x[i + 2] || 0, 9, -51403784)
    c = gg(c, d, a, b, x[i + 7] || 0, 14, 1735328473)
    b = gg(b, c, d, a, x[i + 12] || 0, 20, -1926607734)
    a = hh(a, b, c, d, x[i + 5] || 0, 4, -378558)
    d = hh(d, a, b, c, x[i + 8] || 0, 11, -2022574463)
    c = hh(c, d, a, b, x[i + 11] || 0, 16, 1839030562)
    b = hh(b, c, d, a, x[i + 14] || 0, 23, -35309556)
    a = hh(a, b, c, d, x[i + 1] || 0, 4, -1530992060)
    d = hh(d, a, b, c, x[i + 4] || 0, 11, 1272893353)
    c = hh(c, d, a, b, x[i + 7] || 0, 16, -155497632)
    b = hh(b, c, d, a, x[i + 10] || 0, 23, -1094730640)
    a = hh(a, b, c, d, x[i + 13] || 0, 4, 681279174)
    d = hh(d, a, b, c, x[i + 0] || 0, 11, -358537222)
    c = hh(c, d, a, b, x[i + 3] || 0, 16, -722521979)
    b = hh(b, c, d, a, x[i + 6] || 0, 23, 76029189)
    a = hh(a, b, c, d, x[i + 9] || 0, 4, -640364487)
    d = hh(d, a, b, c, x[i + 12] || 0, 11, -421815835)
    c = hh(c, d, a, b, x[i + 15] || 0, 16, 530742520)
    b = hh(b, c, d, a, x[i + 2] || 0, 23, -995338651)
    a = ii(a, b, c, d, x[i + 0] || 0, 6, -198630844)
    d = ii(d, a, b, c, x[i + 7] || 0, 10, 1126891415)
    c = ii(c, d, a, b, x[i + 14] || 0, 15, -1416354905)
    b = ii(b, c, d, a, x[i + 5] || 0, 21, -57434055)
    a = ii(a, b, c, d, x[i + 12] || 0, 6, 1700485571)
    d = ii(d, a, b, c, x[i + 3] || 0, 10, -1894986606)
    c = ii(c, d, a, b, x[i + 10] || 0, 15, -1051523)
    b = ii(b, c, d, a, x[i + 1] || 0, 21, -2054922799)
    a = ii(a, b, c, d, x[i + 8] || 0, 6, 1873313359)
    d = ii(d, a, b, c, x[i + 15] || 0, 10, -30611744)
    c = ii(c, d, a, b, x[i + 6] || 0, 15, -1560198380)
    b = ii(b, c, d, a, x[i + 13] || 0, 21, 1309151649)
    a = ii(a, b, c, d, x[i + 4] || 0, 6, -145523070)
    d = ii(d, a, b, c, x[i + 11] || 0, 10, -1120210379)
    c = ii(c, d, a, b, x[i + 2] || 0, 15, 718787259)
    b = ii(b, c, d, a, x[i + 9] || 0, 21, -343485551)
    a = (a + oa) | 0
    b = (b + ob) | 0
    c = (c + oc) | 0
    d = (d + od) | 0
  }
  return wordsToHex([a, b, c, d])
}
