/**
 * Webhook URL safety (M37-T03, ADR-0030): a server that POSTs to URLs its
 * users choose must not become a proxy into its own network.
 *
 * Checked twice. At registration, so a bad URL is refused with a reason. And
 * inside the delivery connection's own DNS lookup (`safeLookup`), so the
 * address that was checked is the address that is connected to - a name that
 * resolved to a public address at registration and to 169.254.169.254 at
 * delivery (DNS rebinding) is refused at delivery.
 */
import { isIP } from "node:net";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";

export type Resolver = (hostname: string) => Promise<LookupAddress[]>;

const defaultResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) => dnsLookup(hostname, { all: true }, (err, addresses) => (err ? reject(err) : resolve(addresses))));

const MAX_URL_LENGTH = 2048;

/** WEBHOOKS_ALLOW_PRIVATE=true: development and on-premises receivers. */
export function allowPrivateTargets(env: Record<string, string | undefined> = process.env): boolean {
  return env.WEBHOOKS_ALLOW_PRIVATE === "true";
}

function v4Octets(ip: string): number[] {
  return ip.split(".").map(Number);
}

function isPublicV4(ip: string): boolean {
  const [a, b, c] = v4Octets(ip) as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false; // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, incl. the cloud metadata service
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** Expands an IPv6 address to its eight 16-bit groups. */
function v6Groups(ip: string): number[] {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf("%");
  if (zone >= 0) addr = addr.slice(0, zone);
  // A trailing dotted IPv4 (::ffff:1.2.3.4) becomes two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (dotted) {
    const [a, b, c, d] = v4Octets(dotted[1]!) as [number, number, number, number];
    addr = addr.slice(0, -dotted[1]!.length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = addr.includes("::") ? addr.split("::") : [addr, undefined];
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const fill = tail !== undefined ? Array(8 - h.length - t.length).fill("0") : [];
  return [...h, ...fill, ...t].map((g) => parseInt(g || "0", 16));
}

function isPublicV6(ip: string): boolean {
  const g = v6Groups(ip);
  const embeddedV4 = () => `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPublicV4(embeddedV4()); // IPv4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicV4(embeddedV4()); // NAT64
  if ((g[0]! & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((g[0]! & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((g[0]! & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  return true;
}

/** True for an address on the public internet. Anything unparseable is not. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPublicV4(ip);
  if (family === 6) return isPublicV6(ip);
  return false;
}

/**
 * Checks a URL for registration. Resolves a hostname and requires every
 * address it names to be public, unless private targets are allowed. Returns
 * the normalized URL; throws an Error whose message says what is wrong.
 */
export async function validateWebhookUrl(raw: string, allowPrivate: boolean, resolve: Resolver = defaultResolver): Promise<string> {
  if (raw.length > MAX_URL_LENGTH) throw new Error(`url is longer than ${MAX_URL_LENGTH} characters`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("url is not a valid URL");
  }
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    throw new Error("url must use https");
  }
  if (url.username || url.password) throw new Error("url must not contain credentials");
  if (url.hash) throw new Error("url must not contain a fragment");
  if (allowPrivate) return url.toString();

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await resolve(host).catch(() => {
    throw new Error(`url host "${host}" does not resolve`);
  })).map((a) => a.address);
  if (addresses.length === 0) throw new Error(`url host "${host}" does not resolve`);
  const blocked = addresses.find((a) => !isPublicAddress(a));
  if (blocked) throw new Error(`url host "${host}" resolves to a non-public address (${blocked})`);
  return url.toString();
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * A `lookup` for `http.request`/`https.request` that refuses non-public
 * addresses - the delivery-time half of the check, run on the very resolution
 * the connection uses.
 */
export function safeLookup(allowPrivate: boolean, resolve: Resolver = defaultResolver) {
  return (hostname: string, options: { all?: boolean } | number | undefined, callback: LookupCallback) => {
    resolve(hostname).then((addresses) => {
      const usable = allowPrivate ? addresses : addresses.filter((a) => isPublicAddress(a.address));
      if (usable.length === 0 || usable.length !== addresses.length) {
        const err: NodeJS.ErrnoException = new Error(`refusing to connect to ${hostname}: it resolves to a non-public address`);
        err.code = "EWEBHOOKADDR";
        return callback(err, "", 0);
      }
      if (typeof options === "object" && options?.all) return callback(null, usable);
      return callback(null, usable[0]!.address, usable[0]!.family);
    }, (err) => callback(err, "", 0));
  };
}
