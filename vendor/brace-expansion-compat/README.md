# brace-expansion compatibility adapter

Legacy ESLint plugins still load `brace-expansion` as a callable CommonJS
export. The fully patched upstream release exports an object instead. This
adapter preserves both interfaces while delegating all expansion work to
upstream `brace-expansion@5.0.8`.

Remove the adapter after every ESLint dependency has migrated away from
`brace-expansion` 1.x.
