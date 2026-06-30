# Start MKJewels Story Studio

Use these commands in PowerShell.

## 1. Go to the app folder

```powershell
cd C:\Users\MIS\Downloads\product-story-generator\mkjewels-story-studio
```

## 2. Install dependencies

Run this once after downloading the project, or whenever `package.json` changes:

```powershell
npm.cmd install
```

## 3. Check environment variables

The app needs this file:

```text
C:\Users\MIS\Downloads\product-story-generator\mkjewels-story-studio\.env.local
```

It should contain:

```env
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
POSTGRES_URL=your_postgres_connection_string
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
AI_PROVIDER=gemini
```

If `.env.local` is missing, create it from the example:

```powershell
Copy-Item .env.example .env.local
```

Then edit `.env.local` and replace the placeholder values.

## 4. Start the development server

```powershell
npm.cmd run dev
```

When it starts, open:

```text
http://localhost:3000
```

Keep the PowerShell window open while using the app.

## 5. Stop the app

In the PowerShell window running the app, press:

```text
Ctrl+C
```

## Common issues

If environment variable changes are not taking effect, stop the server with `Ctrl+C` and run `npm.cmd run dev` again.

If `localhost:3000` is already in use, Next.js may offer another port such as `3001`. Open the URL shown in the terminal.

If upload or story generation fails, confirm these values are correct in `.env.local`:

```env
BLOB_READ_WRITE_TOKEN=...
POSTGRES_URL=...
GEMINI_API_KEY=...
```
