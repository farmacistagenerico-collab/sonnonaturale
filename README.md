# Sonno Naturale — app

Mobile-first bilingual (Italian/English) PWA for Sonno Naturale (Natural Sleep in English). The language preference is saved to the user's Supabase profile. It includes client goals, a 30-day protocol guide, sleep diary and secure coach messaging, plus a coach dashboard for assigned clients, goal assignment and personalised supportive notes. User-written messages and notes remain in the language entered; they are not machine-translated.

## Build and hosting

The app is published separately from the existing informational site with GitHub Pages. The workflow in `.github/workflows/pages.yml` runs `npm ci`, `npm test`, and `npm run build`, then publishes `dist/`; the SQL migration is not included in the public site. Relative asset paths make the app work at the project Pages URL `https://farmacistagenerico-collab.github.io/sonnonaturale/` without replacing the existing Netlify site. Add that exact URL as the Supabase Auth Site URL and allowed Redirect URL. GitHub Pages must be enabled for **GitHub Actions** in repository settings. Run the same checks locally with `npm test` and `npm run build`. The automated app-flow tests use a mocked Supabase API; they verify the client/coach flows and guard the schema/RLS definitions, but do not replace a live RLS test against the hosted database. A Netlify build configuration remains available as an optional alternative.

## Run locally

No runtime dependencies are needed. Serve this directory over HTTP, for example:

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173`. For the Arena live preview, use the same static server command with `start_process`.

## Prototype boundaries

The app uses Supabase email/password sign-in and role-aware client/coach screens. RLS-protected calls cover assigned goals, completions, sleep entries, coach notes, messages and consent records. The browser uses only the public publishable key; it never receives a `service_role` key. Registration includes acknowledgement of the linked privacy notice, whose final wording and lawful basis must be reviewed before collecting real health data. The English interface is available, but the linked privacy notice is currently Italian-only; prepare and review an English notice before accepting real English-speaking participants. Coach promotion and client assignments are currently managed in Supabase; invitation/onboarding, password recovery, push reminders, appointment booking and full retention/deletion workflows remain future work. Test with separate client and coach accounts before use. This is not a medical service: clinical and medication decisions remain with the patient's physician.

## Supabase foundation

`supabase/schema.sql` is the initial migration (you confirmed it has been run). It creates user profiles (new accounts are always clients), coach/client assignments, sleep entries, bilingual goals, completions, coach notes, messages and privacy-consent records, with Row Level Security enabled. `supabase-config.js` contains the Project URL and publishable key you supplied. `supabase-client.js` provides the minimal browser Auth/PostgREST calls without a service key or third-party runtime dependency.

### Set up the Supabase project

1. Confirm your project is in an EU database region appropriate for your users. Keep the database password and recovery codes private.
2. You confirmed that `supabase/schema.sql` has been run. If starting from a fresh project, review and run it once in **SQL Editor**.
3. Enable email/password sign-in and set the correct Site URL and redirect URLs in Supabase Auth for local development and the deployed app.
4. Create your account, verify your email, then promote your account to coach in the SQL Editor. For initial testing, replace the email below with the address you registered:

   ```sql
   update public.profiles
   set role = 'coach'
   where id = (select id from auth.users where email = 'YOUR_EMAIL');
   ```

   Assign a test client by replacing both addresses with verified accounts:

   ```sql
   insert into public.coach_clients (coach_id, client_id)
   select coach.id, client.id
   from public.profiles coach, public.profiles client
   where coach.id = (select id from auth.users where email = 'YOUR_EMAIL')
     and client.id = (select id from auth.users where email = 'CLIENT_EMAIL')
   on conflict do nothing;
   ```

   Do not let users choose their own role. An invitation/onboarding flow is a later milestone.
5. The frontend is configured with the **Project URL** and **publishable key** in `supabase-config.js`. Never put the `service_role` key in browser code or share it.

This migration is a starting point, not a claim of GDPR compliance. Before real client/health information is stored, decide and document the lawful basis and explicit-consent flow with a qualified privacy professional, define retention/deletion and backup policies, review access and incident handling, and test every RLS policy with separate client and coach accounts. Choosing an EU region alone does not make a service GDPR-compliant.

### Next implementation milestone

Next: confirm the Auth Site URL/redirects, create and verify Daniele's account, promote it to `coach`, then create a separate test client and assign it. Verify both roles and RLS behavior in the live preview; the sandbox cannot directly query the user's Supabase project, so browser-side integration still needs an end-to-end check.
