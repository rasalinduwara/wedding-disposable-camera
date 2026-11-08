# One-Click Git Commit & Push Script
# Usage: .\deploy-push.ps1 "Updated camera filter settings"

param(
  [string]$Message = "Update Wedding Disposable Camera App"
)

git add .
git commit -m $Message
git push -u origin main

Write-Host "✅ Changes pushed to GitHub! Your free host (Cloudflare Pages / Vercel / Netlify) will auto-deploy in ~15 seconds." -ForegroundColor Green
