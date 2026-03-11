# Deploy Adriredesign to mvp.floropolis.com

This guide deploys the **Adriredesign** branch to **mvp.floropolis.com** without changing **main** or **www.floropolis.com**.

---

## 1. Is the repo already connected to Vercel?

**What we know from your repo:**

- There is **no `.vercel/` directory** in the project, so this workspace has not been linked via CLI.
- That does **not** mean the GitHub repo is unconnected: many teams connect via the Vercel dashboard only.

**How to check:**

1. **Vercel Dashboard**  
   Go to [vercel.com/dashboard](https://vercel.com/dashboard). If you see a project named something like `floropolis-website` or `floropolis`, the repo is likely already connected.

2. **CLI (optional)**  
   On your machine (with Vercel CLI installed and logged in):
   ```bash
   vercel login
   vercel whoami
   vercel project ls
   ```
   If you see your team/username and a Floropolis project, the account is linked. `vercel project ls` shows which projects exist (and by implication whether the GitHub repo is connected).

---

## 2. Where is floropolis.com DNS managed?

We can’t see your DNS from the repo. You can find it in one of these ways:

- **Vercel:** Project → **Settings → Domains**. For each domain it shows “Nameservers” or “DNS provider”; that tells you if Vercel is the DNS or if you’re using an external provider.
- **Registrar:** Log into where you bought **floropolis.com** (e.g. Namecheap, GoDaddy, Google Domains, Cloudflare). The registrar often shows “DNS” or “Nameservers”; the nameservers (e.g. `ns1.vercel-dns.com` or `*.cloudflare.com`) tell you who manages DNS.
- **Quick check:** If **www.floropolis.com** is already live on Vercel, then either:
  - Vercel DNS is used for the domain, or  
  - An external DNS (Cloudflare, etc.) has CNAME/A records pointing to Vercel.

For **mvp.floropolis.com** you will either add the domain in Vercel and follow Vercel’s DNS instructions, or add a CNAME in your current DNS provider (see below).

---

## 3. Safest way to deploy Adriredesign to mvp.floropolis.com

Rule: **Do not push to `main` and do not change the production deployment.** All steps below only add a domain and (if needed) connect the repo; they don’t touch `main` or www.

---

### If the repo IS already connected to Vercel

1. **Push the Adriredesign branch (if not already):**
   ```bash
   git push origin Adriredesign
   ```
   This does **not** affect `main` or www.

2. **In Vercel:** Open your project → **Settings → Git**:
   - **Production Branch:** keep **`main`**.
   - So: `main` → production (www.floropolis.com), and **Adriredesign** will get its own preview deployments.

3. **Assign mvp.floropolis.com to Adriredesign:**
   - **Settings → Domains** → **Add** → enter `mvp.floropolis.com`.
   - After adding, click the **Edit** (or gear) next to `mvp.floropolis.com`.
   - Set **“Assign to branch”** (or “Branch”) to **`Adriredesign`**.
   - Save.

4. **DNS for mvp.floropolis.com:**
   - If Vercel manages DNS: it will show the record to add (usually CNAME `mvp` → `cname.vercel-dns.com` or similar). Create it in the same place you manage floropolis.com.
   - If you use an external DNS (e.g. Cloudflare): add a **CNAME** record:
     - **Name:** `mvp` (or `mvp.floropolis.com` depending on the UI)
     - **Target:** the value Vercel shows (e.g. `cname.vercel-dns.com`).

5. **Result:**
   - **main** → production → **www.floropolis.com** (unchanged).
   - **Adriredesign** → **mvp.floropolis.com** (new). Every push to `Adriredesign` updates only mvp.

---

### If the repo is NOT connected to Vercel

1. **Import the repo:**
   - [vercel.com/new](https://vercel.com/new) → **Import** → select **facufloropolis/floropolis-website** (or connect GitHub and then choose that repo).
   - **Framework Preset:** Next.js.
   - **Root Directory:** leave default (repository root).
   - **Production Branch:** set to **`main`** (so only `main` is “production”).

2. **Deploy once:** Click Deploy. That will deploy `main` and, if you add www now, you can point **www.floropolis.com** to this project’s production.

3. **Add both domains (no change to main’s behavior):**
   - **Settings → Domains:**
     - Add **www.floropolis.com** and assign it to **Production** (main).
     - Add **mvp.floropolis.com** and assign it to branch **`Adriredesign`**.

4. **DNS:** For both domains, create the records Vercel shows (CNAME or A). Use your current floropolis.com DNS host (from step 2 above).

5. **Push Adriredesign so mvp has something to deploy:**
   ```bash
   git push origin Adriredesign
   ```

Result: **main** → www.floropolis.com; **Adriredesign** → mvp.floropolis.com.

---

## Checklist

- [ ] Confirmed in Vercel whether the repo is connected and which branch is Production (`main`).
- [ ] **Production Branch** in Vercel is **main** (www stays on current code).
- [ ] **Adriredesign** is pushed: `git push origin Adriredesign`.
- [ ] **mvp.floropolis.com** added in Vercel and assigned to branch **Adriredesign**.
- [ ] DNS for **mvp** (CNAME or A) set at your DNS provider.
- [ ] No pushes to **main** and no change to www’s domain or deployment.

---

## Quick reference

| Branch        | Domain              | Purpose                    |
|---------------|---------------------|----------------------------|
| **main**      | www.floropolis.com  | Current production (unchanged) |
| **Adriredesign** | mvp.floropolis.com | MVP / new design          |

**Repo:** `git@github.com:facufloropolis/floropolis-website.git`
