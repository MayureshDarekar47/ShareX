import os from 'os';

export interface NetworkAddress {
  family: 'IPv4' | 'IPv6';
  address: string;
  interface: string;
  internal: boolean;
}

/**
 * Discover all non-loopback network addresses on the host machine.
 * Returns IPv4 addresses sorted so LAN addresses come first.
 */
export function getNetworkAddresses(): NetworkAddress[] {
  const interfaces = os.networkInterfaces();
  const addresses: NetworkAddress[] = [];

  for (const [ifaceName, ifaceList] of Object.entries(interfaces)) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.internal) continue;
      addresses.push({
        family: iface.family as 'IPv4' | 'IPv6',
        address: iface.address,
        interface: ifaceName,
        internal: iface.internal,
      });
    }
  }

  // Sort: IPv4 first, then prefer 192.168.x.x, 10.x.x.x, 172.16-31.x.x
  return addresses.sort((a, b) => {
    const aIsIPv4 = a.family === 'IPv4' ? 0 : 1;
    const bIsIPv4 = b.family === 'IPv4' ? 0 : 1;
    if (aIsIPv4 !== bIsIPv4) return aIsIPv4 - bIsIPv4;

    const aIsLAN = isLAN(a.address) ? 0 : 1;
    const bIsLAN = isLAN(b.address) ? 0 : 1;
    return aIsLAN - bIsLAN;
  });
}

export function getPrimaryAddress(): string {
  const addrs = getNetworkAddresses();
  const ipv4 = addrs.find((a) => a.family === 'IPv4');
  return ipv4?.address || '127.0.0.1';
}

export function isLAN(address: string): boolean {
  return (
    address.startsWith('192.168.') ||
    address.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

export function buildUrl(address: string, port: number): string {
  return `http://${address}:${port}`;
}
