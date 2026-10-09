# Neon Database, Vercel Blob & Deployment Setup Guide

This guide provides step-by-step instructions for configuring **Neon Serverless Postgres** for metadata, **Vercel Blob** for cloud video uploads, and deploying **RecordWeb** to **Vercel**.

---

## Part 1: Setting up Neon Serverless Postgres

### Step 1: Create a Neon Account & Project
1. Navigate to [https://neon.tech](https://neon.tech) and sign up or sign in.
2. Click **Create Project** (or **New Project**).
3. Configure your project:
   - **Project Name**: `recordweb-db`
   - **Postgres Version**: Keep default (v16 or latest)
   - **Region**: Choose the region closest to you (e.g., `AWS ap-southeast-1 Singapore` or `us-east-1`).
4. Click **Create Project**.

### Step 2: Retrieve the Connection String
1. In the Neon Console Dashboard, find the **Connection Details** widget.
2. Select **Pooled connection** (recommended for serverless environments).
3. Copy the connection string:
   ```text
   postgresql://[user]:[password]@[endpoint].pooler.[region].neon.tech/neondb?sslmode=require
   ```
4. This will be your `DATABASE_URL`.

### Step 3: Initialize Database Tables
1. In the Neon Console, click on **SQL Editor** in the left sidebar.
2. Run the following SQL script:

```sql
-- 1. Create recordings metadata table (with Vercel Blob support)
CREATE TABLE IF NOT EXISTS recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    duration_seconds REAL NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    resolution VARCHAR(32) NOT NULL DEFAULT '1920x1080',
    fps INTEGER NOT NULL DEFAULT 30,
    mime_type VARCHAR(64) NOT NULL DEFAULT 'video/webm',
    local_id VARCHAR(128),
    storage_url TEXT NULL,            -- Public Vercel Blob CDN URL
    blob_pathname TEXT NULL,          -- Pathname in Vercel Blob storage
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create studio presets table
CREATE TABLE IF NOT EXISTS studio_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preset_name VARCHAR(100) NOT NULL,
    pip_shape VARCHAR(32) DEFAULT 'circle',
    pip_size VARCHAR(32) DEFAULT 'medium',
    pip_position VARCHAR(32) DEFAULT 'bottom-right',
    bg_removal_mode VARCHAR(32) DEFAULT 'blur',
    filters_config JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create index for fast chronological query
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings (created_at DESC);
```
3. Click **Run** to execute.

---

## Part 2: Setting up Vercel Blob (Video Cloud Storage)

Vercel Blob provides global, scalable object storage for video files, with seamless integration into Vercel projects.

### Step 1: Create a Blob Store in Vercel
1. Log in to [https://vercel.com](https://vercel.com).
2. Go to the **Storage** tab in your Vercel Dashboard (or go to your project page -> **Storage**).
3. Click **Create Database** and select **Blob**.
4. Choose a store name (e.g., `recordweb-videos`).
5. Choose your preferred region and click **Create**.

### Step 2: Retrieve the Access Token
1. In the Blob store page, go to the **Quickstart** or **Settings** tab.
2. Locate the environment variable `BLOB_READ_WRITE_TOKEN`.
3. Copy the token string (it begins with `vercel_blob_rw_...`).

### Step 3: Understanding Direct Client-to-Blob Uploads
> [!IMPORTANT]
> Standard serverless functions limit HTTP request bodies to 4.5 MB. Since 5-minute video recordings can be 50 MB to 150 MB+, RecordWeb uses the **Direct Client Upload** pattern via `@vercel/blob/client`:
> 1. The client browser requests an authorized upload token from `/api/upload`.
> 2. The client browser uploads the binary WebM video file directly to Vercel's global Blob CDN.
> 3. Vercel Blob returns a permanent public URL, which is then stored in Neon Postgres!

---

## Part 3: Local Environment Configuration

In the root of the `recordweb` workspace, create `.env.local`:

```bash
# Neon Postgres Connection (Pooled)
DATABASE_URL="postgresql://[user]:[password]@[endpoint].pooler.[region].neon.tech/neondb?sslmode=require"

# Vercel Blob Read/Write Token
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
```

*(Note: `.env.local` is listed in `.gitignore` and will never be committed to Git).*

---

## Part 4: Deploying to Vercel

### Step 1: Push Repository to GitHub
```bash
git add .
git commit -m "feat: configure neon, vercel blob and serverless api"
git push origin main
```

### Step 2: Import Project in Vercel Dashboard
1. Go to [https://vercel.com/new](https://vercel.com/new) and select your `recordweb` repository.
2. Under **Framework Preset**, select **Next.js** (automatically detected by Vercel).
3. Under **Environment Variables**, add:
   * `DATABASE_URL`: Your Neon pooled connection string.
   * `BLOB_READ_WRITE_TOKEN`: Your Vercel Blob access token (or connect the Blob store directly using the **Connect Store** button).
4. Click **Deploy**.

---

## Part 5: Browser Permissions & SSL

> [!TIP]
> Browsers strictly require a secure origin (`https://`) to allow `getDisplayMedia` (screen capture) and `getUserMedia` (camera/mic).
> Deploying to Vercel provides automatic HTTPS with free SSL certificates, guaranteeing that camera and screen capture work without security warnings.
