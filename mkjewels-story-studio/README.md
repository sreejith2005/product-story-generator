# MKJewels Story Studio

Internal admin app for MKJewels staff to upload jewelry photos and persist piece records for the story-generation workflow.

This phase includes Supabase Storage image upload, Supabase persistence, a dashboard grid, AI draft generation, and a piece detail review workflow with editable attributes, story copy, save, and approval controls.

There is no in-app login. Treat this as a private internal tool and handle access at the hosting layer later, for example with Vercel deployment protection or password protection for the whole site.

## Setup

1. Install dependencies:

```powershell
npm.cmd install
```

2. Create `.env.local` from `.env.example`:

```powershell
Copy-Item .env.example .env.local
```

Required variables:

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
AI_PROVIDER=gemini
```

3. Apply the database schema in Supabase:

```powershell
psql $env:POSTGRES_URL -f .\db\schema.sql
```

If you do not have `psql` locally, run the SQL in the Supabase SQL editor.

4. Start the development server:

```powershell
npm.cmd run dev
```

Open `http://localhost:3000` and upload JPG, PNG, or WEBP images under 10MB each.

## Vercel Deployment

1. Create or connect a Vercel project for this Next.js app.
2. Create the `jewelry-images` Supabase Storage bucket and apply `db/schema.sql` in Supabase.
3. Set the environment variables listed in `.env.example`.
4. Confirm `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel before uploading pieces.
5. Enable hosting-level access control before sharing the URL, such as Vercel deployment protection or password protection for the whole site.
6. Deploy normally through Vercel.

The app uses the Next.js App Router and server-side API routes. Uploaded images are stored in Supabase Storage and each successful upload inserts a `pieces` row, marks it as `processing`, and generates draft story fields server-side with Gemini.
