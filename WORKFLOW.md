# 🚀 Development Workflow Guide

## Branch Strategy

### `main` Branch = PRODUCTION
- **What it is:** The live version deployed at www.floropolis.com
- **DO NOT work directly on this branch**
- **Only merge to this when ready to deploy**

### `dev` Branch = DEVELOPMENT
- **What it is:** Your working branch for new features and changes
- **Work here:** Make all your changes on this branch
- **Test locally:** Run `npm run dev` to test changes
- **Safe to experiment:** Won't affect production

---

## 📋 Standard Workflow

### 1. Starting Work (Always start from dev branch)
```bash
cd /Users/facu/Desktop/floropolis-upgrade
git checkout dev
git pull origin dev  # Get latest dev changes
```

### 2. Making Changes
- Edit files, make your changes
- Test locally: `npm run dev` (runs on http://localhost:3000)
- Verify everything works

### 3. Committing Your Work
```bash
git add .
git commit -m "Description of your changes"
git push origin dev
```

### 4. When Ready to Deploy to Production
```bash
# Switch to main branch
git checkout main

# Pull latest production code
git pull origin main

# Merge dev into main
git merge dev

# Push to production
git push origin main

# Switch back to dev for next work
git checkout dev
```

---

## 🔄 Daily Workflow

**Always work on `dev` branch:**
```bash
cd /Users/facu/Desktop/floropolis-upgrade
git checkout dev
npm run dev
```

**Production stays untouched until you merge `dev` → `main`**

---

## ⚠️ Important Rules

1. **NEVER commit directly to `main`** - always use `dev` first
2. **Test on `dev`** before merging to `main`
3. **`main` = Production** - only merge when ready to deploy
4. **`dev` = Development** - safe to experiment

---

## 🆘 Quick Commands

**Check which branch you're on:**
```bash
git branch
```

**Switch to dev:**
```bash
git checkout dev
```

**Switch to main:**
```bash
git checkout main
```

**See what's changed:**
```bash
git status
```

**Discard local changes (if needed):**
```bash
git restore .
```

---

**Last Updated:** 2026-02-02