import { describe, it, expect } from "bun:test";
import { isPublicAddress, validateWebhookUrl, safeLookup, allowPrivateTargets, type Resolver } from "./urlSafety";

/** M37-T03 (ADR-0030): the request-forgery guard, both halves. */
const resolver = (table: Record<string, string[]>): Resolver => async (host) => {
  const addrs = table[host];
  if (!addrs) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  return addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};

describe("isPublicAddress", () => {
  it("refuses every non-public IPv4 range", () => {
    for (const ip of ["0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
      "192.168.1.1", "192.0.0.8", "192.0.2.1", "198.18.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "255.255.255.255"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.0.1", "192.169.0.1", "93.184.216.34"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("refuses non-public IPv6, including IPv4 smuggled in mapped and NAT64 forms", () => {
    for (const ip of ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "ff02::1", "2001:db8::1",
      "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "64:ff9b::10.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::8.8.8.8"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("refuses anything that is not an address", () => {
    expect(isPublicAddress("localhost")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
  });
});

describe("validateWebhookUrl", () => {
  const dns = resolver({ "hooks.example.com": ["93.184.216.34"], "sneaky.example.com": ["93.184.216.34", "10.0.0.5"], "metadata.example.com": ["169.254.169.254"] });

  it("accepts an https URL whose host resolves only to public addresses", async () => {
    expect(await validateWebhookUrl("https://hooks.example.com/tasker?x=1", false, dns)).toBe("https://hooks.example.com/tasker?x=1");
    expect(await validateWebhookUrl("https://[2606:4700:4700::1111]/h", false, dns)).toBe("https://[2606:4700:4700::1111]/h");
  });

  it("refuses the wrong scheme, credentials, fragments, junk and over-long URLs", async () => {
    await expect(validateWebhookUrl("http://hooks.example.com/", false, dns)).rejects.toThrow("must use https");
    await expect(validateWebhookUrl("ftp://hooks.example.com/", false, dns)).rejects.toThrow("must use https");
    await expect(validateWebhookUrl("https://u:p@hooks.example.com/", false, dns)).rejects.toThrow("credentials");
    await expect(validateWebhookUrl("https://hooks.example.com/#x", false, dns)).rejects.toThrow("fragment");
    await expect(validateWebhookUrl("not a url", false, dns)).rejects.toThrow("not a valid URL");
    await expect(validateWebhookUrl("https://hooks.example.com/" + "a".repeat(2048), false, dns)).rejects.toThrow("longer than");
  });

  it("refuses private literals, names resolving to any private address, and names that do not resolve", async () => {
    await expect(validateWebhookUrl("https://127.0.0.1/", false, dns)).rejects.toThrow("non-public address (127.0.0.1)");
    await expect(validateWebhookUrl("https://[::1]/", false, dns)).rejects.toThrow("non-public");
    await expect(validateWebhookUrl("https://metadata.example.com/", false, dns)).rejects.toThrow("169.254.169.254");
    await expect(validateWebhookUrl("https://sneaky.example.com/", false, dns)).rejects.toThrow("10.0.0.5");
    await expect(validateWebhookUrl("https://nowhere.example.com/", false, dns)).rejects.toThrow("does not resolve");
  });

  it("allows http and private targets only when told to", async () => {
    expect(await validateWebhookUrl("http://127.0.0.1:9000/hook", true, dns)).toBe("http://127.0.0.1:9000/hook");
    expect(allowPrivateTargets({ WEBHOOKS_ALLOW_PRIVATE: "true" })).toBe(true);
    expect(allowPrivateTargets({ WEBHOOKS_ALLOW_PRIVATE: "1" })).toBe(false);
    expect(allowPrivateTargets({})).toBe(false);
  });
});

describe("safeLookup", () => {
  const dns = resolver({ "hooks.example.com": ["93.184.216.34"], "rebound.example.com": ["169.254.169.254"], "mixed.example.com": ["93.184.216.34", "127.0.0.1"] });
  const look = (lookup: ReturnType<typeof safeLookup>, host: string, options: any) =>
    new Promise<{ err: any; address: any; family?: number }>((resolve) => lookup(host, options, (err, address, family) => resolve({ err, address, family })));

  it("answers with the vetted address, in both callback shapes", async () => {
    expect(await look(safeLookup(false, dns), "hooks.example.com", {})).toEqual({ err: null, address: "93.184.216.34", family: 4 });
    expect((await look(safeLookup(false, dns), "hooks.example.com", { all: true })).address).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("refuses a host that resolves - now - to any non-public address", async () => {
    for (const host of ["rebound.example.com", "mixed.example.com"]) {
      const { err } = await look(safeLookup(false, dns), host, {});
      expect(err.code).toBe("EWEBHOOKADDR");
    }
    expect((await look(safeLookup(true, dns), "rebound.example.com", {})).address).toBe("169.254.169.254");
    expect((await look(safeLookup(false, dns), "nowhere.example.com", {})).err.code).toBe("ENOTFOUND");
  });
});
