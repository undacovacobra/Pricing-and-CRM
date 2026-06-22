# Recoleta font

Recoleta is a commercial font (by Latinotype). It is **not** included in this
repo because it requires a paid license.

To activate Recoleta across the site, drop your licensed WOFF2 files here with
these exact names:

- `Recoleta-Regular.woff2`  (weight 400)
- `Recoleta-Medium.woff2`   (weight 500)
- `Recoleta-SemiBold.woff2` (weight 600)
- `Recoleta-Bold.woff2`     (weight 700)

The `@font-face` rules in `app/globals.css` already point to these paths, so
once the files are present Recoleta will be used automatically. Until then the
site falls back to **Fraunces** (a free Google font with a similar soft-serif
feel).
