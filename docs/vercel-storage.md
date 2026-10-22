# Vercel: why storage fills up, and what to do

## Why it filled up
`vercel.json` runs `build.sh`, which used to clone the Flutter SDK and build the Flutter web app into `/app` on **every** deployment,
including every preview link. That adds tens of megabytes and several minutes to each one, and Vercel keeps every deployment until you
remove it. The Flutter web app is only for your own testing, so previews do not need it.

## What changed in the code
- **Preview deployments skip the Flutter build.** They contain only the website and a small placeholder at `/app`.
  Production deployments build everything exactly as before (the same five commands).
- To include the Flutter app on a particular preview, set `BUILD_FLUTTER=true` in the project's Environment Variables (Preview scope).
- Nothing on the site links to `/app`, and `/app` is marked noindex, as before.

## What you do in the Vercel dashboard (code cannot do this)
1. **Set a retention policy** so old deployments are deleted automatically. In the project's Settings, look for **Deployment Retention**
   (the exact place may move; search the settings page for "retention"). A sensible choice is to keep production deployments for a long
   time and delete previews after a few weeks. The most recent production deployment is always kept.
2. **Delete the old ones now.** Project, Deployments: filter by Preview and delete the old ones. This is what frees the space you are
   already using; the code change only stops it growing as fast.
3. Check **Settings, Git** to see whether every branch gets a preview. If you only need previews for the branch you review from, ignore the rest.

## Things that are already efficient
- The guide covers are about 7 MB of progressive JPEGs at 600 and 900 pixels wide. They are already well compressed: re-encoding saves
  only 16 to 25% and visibly softens the text on the preview pages. Converting to WebP would save more but means changing image paths on
  generated pages; it is not worth the risk for the space.
