// Where the local server can be reached from other devices (phone on the same network). Pure.

const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|vbox|docker|loopback|tailscale|zerotier|hamachi|vpn|tap-|tun/i;

/**
 * os.networkInterfaces() → [{ name, address, virtual }] for IPv4 addresses other devices can use:
 * real adapters (Wi-Fi, Ethernet) first, virtual ones (Hyper-V, WSL, VPN, …) last and marked.
 */
export function lanAddresses(interfaces) {
  return Object.entries(interfaces || {})
    .flatMap(([name, list]) => (list || []).filter(i => i && (i.family === 'IPv4' || i.family === 4) && !i.internal && !i.address.startsWith('169.254.')).map(i => ({ name, address: i.address, virtual: VIRTUAL.test(name) })))
    .sort((a, b) => a.virtual - b.virtual);
}

/** The lines the server prints at startup. */
export function startupLines({ port, root, hostname, interfaces, loc }) {
  const q = loc ? `?loc=${encodeURIComponent(loc)}` : '';
  const lan = lanAddresses(interfaces), real = lan.filter(a => !a.virtual);
  const lines = [
    'Plantern is running.',
    `  This computer:  http://localhost:${port}/${q}`,
    `  Where your houses are kept (add a folder or a git repository): http://localhost:${port}/storage.html`,
  ];
  if (real.length) {
    lines.push('  Phone / tablet on the same network:');
    for (const a of real) lines.push(`    http://${a.address}:${port}/wizard.html${q}    (${a.name})`);
    if (hostname) lines.push(`    http://${hostname.toLowerCase()}.local:${port}/wizard.html${q}    (by name; works on many phones, not all)`);
    lines.push('    (doors & windows: the same address with /openings.html instead of /wizard.html)');
  } else lines.push('  No network address found: the phone cannot reach this computer (is it on Wi-Fi or a cable?).');
  for (const a of lan.filter(x => x.virtual)) lines.push(`    (also ${a.address} on ${a.name}, a virtual adapter: not for the phone)`);
  if (real.length) lines.push('  If the phone cannot connect: allow Node.js on private networks in Windows Firewall, and check the phone is on the same Wi-Fi.');
  lines.push(`  Files: ${root}`, 'Ctrl+C stops the server.');
  return lines;
}
