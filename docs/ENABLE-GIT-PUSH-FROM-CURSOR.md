# How to Let Cursor Push to GitHub (main)

When Cursor runs `git push origin main`, it fails because Git cannot prompt for your username/password ("Device not configured"). To fix that, use **non-interactive** authentication so no prompt is needed.

---

## Option A: Use SSH (recommended)

Git uses your SSH key instead of asking for a password.

### 1. Use SSH remote instead of HTTPS

In Terminal (in Cursor or your Mac):

```bash
cd /Users/facu/Desktop/floropolis-upgrade
git remote -v
```

If you see `https://github.com/facufloropolis/floropolis-website.git`, switch to SSH:

```bash
git remote set-url origin git@github.com:facufloropolis/floropolis-website.git
git remote -v
```

You should see `origin  git@github.com:facufloropolis/floropolis-website.git`.

### 2. Make sure your SSH key is loaded

- **If your key has a passphrase:** Before asking Cursor to push, run once in your Mac Terminal (outside Cursor):  
  `ssh-add`  
  Enter the passphrase. The key stays in the agent until you restart or log out.

- **If your key has no passphrase:** Nothing else to do; `git push` over SSH will work without a prompt.

### 3. Test from Cursor Terminal

In Cursor, open Terminal and run:

```bash
cd /Users/facu/Desktop/floropolis-upgrade
git push origin main
```

If this works when **you** run it in Cursor’s terminal, the AI’s `git push` (with the right permissions) has a good chance of working too, because it will use the same SSH agent.

---

## Option B: Use a Personal Access Token (HTTPS)

If you prefer to keep using HTTPS, Git must have credentials stored so it never prompts.

### 1. Create a GitHub Personal Access Token

- GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
- **Generate new token (classic)**.
- Name it (e.g. "Cursor floropolis push").
- Expiration: 90 days or "No expiration" (your choice).
- Scopes: check **repo** (full control of private repositories).
- Generate and **copy the token** (you won’t see it again).

### 2. Store the token so Git doesn’t ask

**Option B1 – Credential helper (store once, use forever until it’s removed)**

In Terminal:

```bash
git config --global credential.helper store
```

Then do **one** push from your machine (Terminal or Cursor), and when Git asks for password, paste the **token** (not your GitHub password). Git will save it. After that, `git push` (including from Cursor) may work without a prompt.

**Option B2 – Remote URL with token (token lives in Git config)**

```bash
cd /Users/facu/Desktop/floropolis-upgrade
git remote set-url origin https://YOUR_GITHUB_USERNAME:YOUR_TOKEN@github.com/facufloropolis/floropolis-website.git
```

Replace `YOUR_GITHUB_USERNAME` and `YOUR_TOKEN`.  
**Warning:** The token is then stored in plain text in `git config`. Only do this on a machine only you use, and consider a short-lived or fine-grained token.

### 3. Test

In Cursor Terminal:

```bash
git push origin main
```

If it pushes without asking for a password, the AI can use the same when it runs the command with the right permissions.

---

## Summary

- **Option A (SSH):** Change remote to `git@github.com:facufloropolis/floropolis-website.git`, ensure your SSH key is in the agent (run `ssh-add` if you use a passphrase), then try `git push origin main` from Cursor.
- **Option B (token):** Use a Personal Access Token and either store it with `credential.helper store` (one manual push) or put it in the remote URL so Git never prompts.

After one of these works when **you** run `git push origin main` in Cursor’s terminal, the same push run by the AI (with network + git_write or "all" permissions) should also succeed.
