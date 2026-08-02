#!/usr/bin/env python3
# Replace (or add) a single brace-balanced vhost block in /etc/caddy/Caddyfile.
# Usage: sudo caddy_set_block.py <domain> <reverse_proxy_target>
# e.g.   sudo caddy_set_block.py test.br8t.com 127.0.0.1:8004
import sys

domain, target = sys.argv[1], sys.argv[2]
path = "/etc/caddy/Caddyfile"
with open(path) as f:
    lines = f.read().splitlines(keepends=True)

out, i, n, removed = [], 0, len(lines), False
while i < n:
    head = lines[i].lstrip()
    if head.startswith(domain) and "{" in lines[i]:
        depth = lines[i].count("{") - lines[i].count("}")
        i += 1
        while i < n and depth > 0:
            depth += lines[i].count("{") - lines[i].count("}")
            i += 1
        removed = True
        continue
    out.append(lines[i])
    i += 1

text = "".join(out).strip("\n")
block = "%s {\n\treverse_proxy %s\n}\n" % (domain, target)
text = (text + "\n\n" + block) if text else block
with open(path, "w") as f:
    f.write(text)
print(("replaced" if removed else "added") + " Caddy block for " + domain)
