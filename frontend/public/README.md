# Brand assets

`src/components/Logo.tsx` picks these up automatically. Nothing is committed
yet, because the originals have not been handed over; until then the app
falls back to a drawn approximation, which is a placeholder and not the
brand.

| Slot | Files tried, in order | Used for |
|---|---|---|
| Wordmark | `logo.svg`, `logo.png`, `logo.webp` | Sidebar lockup |
| Mark | `logo-mark.svg`, `logo-mark.png`, `logo-mark.webp` | Mobile header, tight spots |
| Share card | `og.png` | Link previews on X, Telegram, Slack, the grant form |

`og.png` should be **1200×630**. It is referenced by the page metadata
already, so dropping the file in is the whole install — until then a shared
link renders as a text-only card, which works but is easy to improve. The
rendered 3D logo is a good fit here, since this is exactly the large-format
context it was made for.

Drop a file in and commit. No code change needed.

## Two logos, not one

Marketing artwork and interface chrome have different jobs, and one file
rarely does both well.

**A detailed 3D or rendered logo** belongs on the X profile, the grant
application, a README banner, social cards — anywhere it appears at 200px or
larger and can be looked at.

**Interface chrome needs a flat, simplified mark.** In the sidebar the
wordmark renders about 28px tall and the favicon is 32px or less. At that
size, bevels, gradients, glows and background shading all collapse into
mud. What survives is a silhouette.

So the asset in `logo.svg` should be the *simplified* version: flat, few
colours, no background, legible at 28px. Keep the rendered one for
marketing.

## Export requirements for the chrome asset

1. **Transparent background.** The app renders on a light surface by default
   and a dark one in dark mode. Artwork with a baked-in background shows as
   a rectangle against whichever theme it does not match.
2. **Wide, not square.** The sidebar slot is a horizontal lockup. A square
   or near-square image is scaled to the row height and ends up tiny.
3. **SVG if at all possible.** A raster at 28px on a 3× display needs about
   84px of real pixels; anything smaller looks soft.
4. **Check it at size.** Shrink the file to 28px tall and look at it. If you
   cannot tell what it is, the interface cannot either.
