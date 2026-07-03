function aplicarHeadersSeguranca(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  res.setHeader("Cross-Origin-Resource-Policy", "same-site")
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  return next()
}

function criarRateLimiter({ limite, janelaMs, escopo }) {
  const acessos = new Map()
  let ultimaLimpeza = 0

  return function rateLimiter(req, res, next) {
    const agora = Date.now()
    if (agora - ultimaLimpeza > janelaMs) {
      ultimaLimpeza = agora
      for (const [chave, registro] of acessos) {
        if (registro.expiraEm <= agora) acessos.delete(chave)
      }
    }

    const ip = String(req.ip || req.socket?.remoteAddress || "desconhecido")
    const chave = `${escopo}:${ip}`
    let registro = acessos.get(chave)
    if (!registro || registro.expiraEm <= agora) {
      registro = { total: 0, expiraEm: agora + janelaMs }
      acessos.set(chave, registro)
    }

    registro.total += 1
    res.setHeader("RateLimit-Limit", String(limite))
    res.setHeader("RateLimit-Remaining", String(Math.max(0, limite - registro.total)))
    res.setHeader("RateLimit-Reset", String(Math.ceil(registro.expiraEm / 1000)))

    if (registro.total > limite) {
      res.setHeader("Retry-After", String(Math.ceil((registro.expiraEm - agora) / 1000)))
      return res.status(429).json({ error: "Muitas requisicoes. Tente novamente em instantes." })
    }
    return next()
  }
}

module.exports = {
  aplicarHeadersSeguranca,
  criarRateLimiter
}
