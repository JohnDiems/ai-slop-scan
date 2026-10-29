import dns from 'node:dns/promises'
import net from 'node:net'

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(p => Number.parseInt(p, 10))
    if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
      return true
    }

    const b0 = parts[0] ?? 0
    const b1 = parts[1] ?? 0
    const b2 = parts[2] ?? 0

    // 0.0.0.0/8
    if (b0 === 0) return true
    // 10.0.0.0/8
    if (b0 === 10) return true
    // 127.0.0.0/8
    if (b0 === 127) return true
    // 169.254.0.0/16 (link-local)
    if (b0 === 169 && b1 === 254) return true
    // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true
    // 192.168.0.0/16
    if (b0 === 192 && b1 === 168) return true
    // 100.64.0.0/10 (carrier-grade NAT)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true
    // 192.0.2.0/24 (TEST-NET-1), 198.51.100.0/24, 203.0.113.0/24
    if (b0 === 192 && b1 === 0 && b2 === 2) return true
    if (b0 === 198 && (b1 === 18 || b1 === 19 || (b1 === 51 && b2 === 100))) return true
    if (b0 === 203 && b1 === 0 && parts[2] === 113) return true
    // 224.0.0.0/4 (multicast) & 240.0.0.0/4 (reserved) & broadcast
    if (b0 >= 224) return true

    return false
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase()
    // ::1 (loopback)
    if (normalized === '::1' || normalized === '::') return true
    // link-local fe80::/10
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
      return true
    }
    // unique local fc00::/7 (fc00:: - fdff::)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true
    }
    // ipv4 mapped ::ffff:x.x.x.x
    if (normalized.startsWith('::ffff:')) {
      const v4 = normalized.slice(7)
      return isPrivateIp(v4)
    }
    return false
  }

  return true
}

export async function validateUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    const formatted = rawUrl.startsWith('http://') || rawUrl.startsWith('https://') 
      ? rawUrl 
      : `https://${rawUrl}`
    url = new URL(formatted)
  } catch {
    throw new Error('Invalid URL format')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS protocols are supported')
  }

  const hostname = url.hostname.toLowerCase()

  // Block obvious localhost / internal hostnames
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname === '0.0.0.0'
  ) {
    throw new Error('Access to local network hosts is blocked')
  }

  // If hostname is directly an IP
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('Access to private/internal IP addresses is blocked')
    }
    return url
  }

  // Resolve DNS to verify IP addresses
  try {
    const records = await dns.lookup(hostname, { all: true })
    if (!records || records.length === 0) {
      throw new Error(`Could not resolve hostname "${hostname}"`)
    }

    for (const record of records) {
      if (isPrivateIp(record.address)) {
        throw new Error('Host resolves to a private or reserved IP address')
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes('private or reserved')) {
      throw err
    }
    throw new Error(`DNS resolution failed for "${hostname}": ${err.message || 'unknown error'}`)
  }

  return url
}

