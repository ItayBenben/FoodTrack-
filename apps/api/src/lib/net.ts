import { isIP } from 'node:net';

function ipv4ToInt(ip: string) { return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0; }

export function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsS] = cidr.split('/');
  const bits = Number(bitsS);
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4 && isIP(range!) === 4) {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipv4ToInt(v4) & mask) === (ipv4ToInt(range!) & mask);
  }
  return ip === range;
}

/** True when the request comes from loopback / the Docker network AND did not arrive through Caddy. */
export function isInternalRequest(ip: string, headers: Record<string, unknown>, cidrs: string): boolean {
  if (headers['x-forwarded-for'] || headers['x-forwarded-host'] || headers['via']) return false;
  return cidrs.split(',').map((c) => c.trim()).some((c) => inCidr(ip, c));
}
