# Security model

What the server accepts, what it refuses, and the limits it applies. To
report a vulnerability, see [SECURITY.md](../SECURITY.md).

## Templates

- The server never stores HTML from the browser. It compiles its own.
- MJML and projects are checked against an allow-list. Scripts, event
  handlers, `javascript:` URLs, `mj-include`, conditional comments and the
  like are refused.
- Previews are rendered in an iframe with an empty `sandbox`.

## Images

- Uploaded images are type-checked from their bytes: PNG, JPEG and GIF. SVG
  is refused.
- The limit is 2 MB per image.
- Images are keyed by the hash of their content and served with `nosniff`
  and a sandboxing CSP.

## Test sends

- At most 10 addresses per send.
- At most 20 sends per user per hour (`rateLimits.testPerHour`).

## Reading a brand from a website

This is a request your server makes to an address a user typed, so it is
fenced:

- only http(s), on ports 80 and 443, with no credentials in the address;
- every address the name resolves to must be public. Refused: loopback,
  private networks, link-local and cloud metadata (`169.254.169.254`),
  carrier-grade NAT, multicast, and IPv4 hidden in IPv6 (mapped, NAT64,
  6to4). The check happens at the lookup itself, so a DNS answer cannot
  slip through;
- redirects (4 at most) are checked the same way;
- pages, stylesheets and logos have size limits after decompression, and the
  whole reading has 8 seconds;
- at most 20 imports per user per hour.

## AI

- Generated emails pass the same MJML validation as saved ones.
- A rewritten text must keep its links and variables, add none, and pass the
  same validation.
- Subject ideas may contain only merge tags from the server's catalog.
- Every AI route needs the `write` permission, and each has a per-user limit:
  30 generations, 200 rewrites and 100 subject requests per hour.
