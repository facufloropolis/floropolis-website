# ⚡ Quick Start - Development Workflow

## 🎯 The Simple Rule

**`main` = Production (www.floropolis.com)**  
**`dev` = Development (your working branch)**

---

## 🚀 Start Working (Every Time)

```bash
cd /Users/facu/Desktop/floropolis-upgrade
git checkout dev
npm run dev
```

Now make your changes and test at http://localhost:3000

---

## ✅ When Ready to Deploy

```bash
# 1. Make sure you're on dev and everything is committed
git checkout dev
git add .
git commit -m "Your changes description"
git push origin dev

# 2. Switch to main and merge
git checkout main
git pull origin main
git merge dev
git push origin main

# 3. Go back to dev for next work
git checkout dev
```

---

## 🔍 Check What Branch You're On

```bash
git branch
```

The `*` shows your current branch.

---

**That's it!** Work on `dev`, test locally, merge to `main` when ready.