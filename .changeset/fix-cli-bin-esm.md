---
"discoprint": patch
---

fix: publish the CLI bin as ESM so `npx discoprint` doesn't crash with `ERR_REQUIRE_ASYNC_MODULE` on Node 22+
