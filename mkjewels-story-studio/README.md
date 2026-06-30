# MKJewels Story Studio

Internal admin app for MKJewels staff to upload jewelry photos and persist piece records for the story-generation workflow.

This phase includes Vercel Blob image upload, Vercel Postgres persistence, a dashboard grid, AI draft generation, and a piece detail review workflow with editable attributes, story copy, save, and approval controls.

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
BLOB_READ_WRITE_TOKEN=...
POSTGRES_URL=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash
AI_PROVIDER=gemini
```

3. Apply the database schema in Vercel Postgres:

```powershell
psql $env:POSTGRES_URL -f .\db\schema.sql
```

If you do not have `psql` locally, run the SQL in the Vercel Postgres query console.

4. Start the development server:

```powershell
npm.cmd run dev
```

Open `http://localhost:3000` and upload JPG, PNG, or WEBP images under 10MB each.

## Vercel Deployment

1. Create or connect a Vercel project for this Next.js app.
2. Add Vercel Blob storage and Vercel Postgres to the project.
3. Set the environment variables listed in `.env.example`.
4. Run `db/schema.sql` against the Vercel Postgres database before uploading pieces.
5. Enable hosting-level access control before sharing the URL, such as Vercel deployment protection or password protection for the whole site.
6. Deploy normally through Vercel.

The app uses the Next.js App Router and server-side API routes. Uploaded images are stored in Vercel Blob and each successful upload inserts a `pieces` row, marks it as `processing`, and generates draft story fields server-side with Gemini.
