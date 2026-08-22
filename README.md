# FileVault — Secure File Sharing Platform

A real full-stack app: Node.js + Express backend, MongoDB (Mongoose), JWT
auth, Multer file uploads, and server-generated QR codes. The frontend is
served by the same Express server (no separate build step), so once this is
deployed anywhere, links and QR codes work **across any device** — that's
the piece the earlier single-HTML demo couldn't do.

## What's inside

```
server/
├── config/db.js             # MongoDB connection
├── config/cloudinary.js     # Cloudinary SDK config
├── models/User.js          # bcrypt password hashing + JWT signing
├── models/File.js          # file metadata, ownership, share settings
├── middleware/auth.js       # verifies JWT, attaches req.user
├── middleware/upload.js     # Multer memory storage, size limit
├── middleware/errorHandler.js
├── utils/cloudFile.js       # upload buffer → Cloudinary, stream file back to client
├── controllers/authController.js   # signup / login / me
├── controllers/fileController.js   # upload / list / download / delete / share
├── controllers/shareController.js  # public (no-auth) share view + download
├── routes/auth.js, files.js, share.js
├── public/                 # frontend (index.html, style.css, app.js)
├── .env.example
└── server.js
```

## 1. Set up MongoDB

You need a real MongoDB database — this is what makes files and accounts
persist and be reachable from any device. Easiest option: a free
[MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) cluster
(takes ~2 minutes, no credit card). Copy the connection string it gives you.

Alternative: install MongoDB locally and use `mongodb://localhost:27017/filevault`.

## 2. Set up Cloudinary (file storage)

Uploaded files are stored on Cloudinary, not on the server's local disk —
this matters because free hosts like Render wipe local disk on every
restart/redeploy, which would silently delete every uploaded file. Cloudinary's
free tier gives 25GB storage + 25GB bandwidth/month, plenty for a project like this.

1. Sign up free at [cloudinary.com](https://cloudinary.com)
2. Your dashboard home page shows **Cloud name**, **API Key**, and **API Secret**
   — copy all three (or the single combined "API Environment variable" string).

## 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
- `MONGODB_URI` — your Atlas (or local) connection string
- `JWT_SECRET` — any long random string (e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — from step 2
  (or just set `CLOUDINARY_URL` to the combined string and delete the three lines above it)

## 4. Install & run

```bash
npm install
npm run dev      # auto-restarts on file changes
# or
npm start        # plain node
```

Visit `http://localhost:5000` — sign up, upload a file, hit **Share** on a
file card to get a link + QR code.

## 5. Push to GitHub

This folder already has git initialized with everything committed
(`.env` and `node_modules` are excluded via `.gitignore` — safe to push).
Just point it at a new empty GitHub repo:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

(Create the empty repo on github.com first — don't initialize it with a
README/license there, since this folder already has its own history.)

## 6. Deploy so it's reachable from other devices

Any Node host works since this is a single Express server (API + frontend
together) — no separate frontend deploy needed. Easy free-tier options:

- **Render** — New → **Blueprint** → connect your GitHub repo → Render
  reads `render.yaml` in this folder and pre-fills the service. You'll
  just need to fill in the blanks it asks for: `MONGODB_URI`,
  `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  (JWT_SECRET is auto-generated). No disk/volume config needed — files go
  to Cloudinary, not Render's disk, so they survive restarts and redeploys.
  (No `render.yaml`/Blueprint access? New → Web Service → connect repo →
  build command `npm install`, start command `npm start` → add the same
  env vars manually in the dashboard.)
- **Railway** — similar: connect repo, add env vars, deploy.

Once deployed, `MONGODB_URI` should point at your Atlas cluster (not
localhost), and share links will use your live domain automatically —
scan the QR from any phone and it'll open and download the file for real.

## API reference

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | — | `{name, password}` → token + user |
| POST | `/api/auth/login` | — | `{name, password}` → token + user |
| GET | `/api/auth/me` | ✓ | current user + storage usage |
| GET | `/api/files` | ✓ | list your files |
| POST | `/api/files/upload` | ✓ | multipart, field `files` (up to 10) |
| GET | `/api/files/:id/download` | ✓ | download your own file |
| DELETE | `/api/files/:id` | ✓ | delete a file |
| POST | `/api/files/:id/share` | ✓ | `{expiresInHours?, password?, maxDownloads?}` → shareUrl + QR (base64 PNG) + 6-digit shareCode |
| DELETE | `/api/files/:id/share` | ✓ | revoke the share link and code |
| GET | `/api/share/:shareId` | — | public file metadata (by link) |
| POST | `/api/share/:shareId/download` | — | `{password?}` → streams the file (by link) |
| GET | `/api/share/code/:code` | — | public file metadata (by 6-digit code) |
| POST | `/api/share/code/:code/download` | — | `{password?}` → streams the file (by code) |

Auth uses `Authorization: Bearer <token>`.

## Notes on what changed from the "one HTML file" version

- Real accounts and files now live in MongoDB + Cloudinary cloud storage —
  not per-browser `localStorage`/IndexedDB — so any device that opens your
  deployed URL sees the same data, and files survive host restarts/redeploys.
  Passwords are hashed with bcrypt (server-side), not just SHA-256 in the browser.
- QR codes are generated **server-side** (`qrcode` npm package) as PNG data
  URLs — no external CDN dependency in the frontend.
- Share links are real paths (`/share/:id`) served by Express, with
  optional expiry, optional password, and an optional max-download count.
- Every share also gets a **6-digit access code** (e.g. `482 913`) as a
  no-link alternative — the receiver clicks "Enter access code" (visible on
  both the login screen and the dashboard), types the digits, and gets the
  same file-info-and-download view without needing the URL or a QR scanner.
  Code lookups are rate-limited (30 per 10 min per IP) since a 6-digit
  space is small enough to matter for brute-forcing.
- Storage is capped per user (1 GB) and per file (50 MB) — both configurable
  via `.env`.

## Known limitations (intentional, for a student/demo project)

- No email verification or "share via email" — flagged as a bonus feature
  in the original spec, not implemented here to keep the core flow solid.
- File-delete on the Cloudinary side is best-effort: if the Cloudinary
  call fails, the app still removes the DB record and updates the user's
  quota so the UI stays correct, but an orphaned asset could remain in
  your Cloudinary account (rare, and free-tier storage is generous).
