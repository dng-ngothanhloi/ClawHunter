#!/usr/bin/env bash
set -euo pipefail

# DRY RUN mode (default). Set CLEAN=1 to actually delete.
DRY=${CLEAN:-0}
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo "== Repo clean =="
echo "Root: $ROOT"
echo "Mode: $([[ "$DRY" = "1" ]] && echo DELETE || echo PREVIEW)"

# Show what would be removed per .gitignore:
echo ""
echo "📋 Files ignored by .gitignore:"
git -C "$ROOT" clean -nXdf

# Standard directories to remove (explicit)
TO_RM=(
  node_modules .npm .yarn .pnpm-store .turbo .cache .cypress .playwright
  dist build out coverage storybook-static .next .nuxt vite.cache parcel-cache
  artifacts cache typechain broadcast
  __pycache__ .pytest_cache .venv
  target bin
)

echo ""
echo "📁 Standard directories to clean:"
for d in "${TO_RM[@]}"; do
  # Find directories matching pattern
  found_dirs=$(find "$ROOT" -name "$d" -type d 2>/dev/null || true)
  if [[ -n "$found_dirs" ]]; then
    echo "  • $d: $(echo "$found_dirs" | wc -l | tr -d ' ') locations"
    echo "$found_dirs" | sed 's/^/    /'
  fi
done

echo ""
echo "🗂️ Large files and directories:"
du -sh "$ROOT"/* 2>/dev/null | sort -hr | head -10

if [[ "$DRY" = "1" ]]; then
  echo ""
  echo "🗑️ DELETING FILES..."
  
  for d in "${TO_RM[@]}"; do
    echo "Removing $d directories..."
    find "$ROOT" -name "$d" -type d -exec rm -rf {} + 2>/dev/null || true
  done
  
  # Remove stray logs & pyc
  echo "Removing log files..."
  find "$ROOT" -type f -name "*.log" -delete 2>/dev/null || true
  find "$ROOT" -type f -name "*.pyc" -delete 2>/dev/null || true
  
  # Also honor .gitignore and remove ignored files:
  echo "Removing .gitignore'd files..."
  git -C "$ROOT" clean -Xdf
  
  echo "✅ Cleanup complete!"
else
  echo ""
  echo "[PREVIEW] To actually delete, run: CLEAN=1 bash scripts/clean-repo.sh"
fi

echo "== Done =="
