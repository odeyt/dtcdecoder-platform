# Domain setup

Add `dtcdecoder.com` and `www.dtcdecoder.com` to the confirmed Vercel project. Copy only the exact DNS records Vercel displays. Preserve current DNS, identify conflicts, wait for verification/SSL, make the apex canonical, and redirect `www` to it.

Then set `NEXT_PUBLIC_SITE_URL=https://dtcdecoder.com`, update Supabase Site URL and exact callbacks, update payment URLs only if billing is enabled, redeploy, and verify HTTPS/canonical metadata/www redirect/robots/sitemap/auth. No DNS was changed during this audit.

