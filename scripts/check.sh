#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=true
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass()  { echo -e "${GREEN}✅ $1${NC}"; }
fail()  { echo -e "${RED}❌ $1${NC}"; PASS=false; }
skip()  { echo -e "${YELLOW}⏭️  $1${NC}"; }
header(){ echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

header "1. TypeScript Compilation (tsc --noEmit)"
if npx tsc --noEmit 2>&1; then
  pass "tsc --noEmit"
else
  fail "tsc --noEmit — fix type errors before pushing"
fi

header "2. Viewer Bundle (esbuild)"
if node build-viewer.mjs 2>&1; then
  pass "esbuild bundle"
else
  fail "esbuild bundle — fix build errors before pushing"
fi

header "3. Full Build (npm run build)"
if npm run build 2>&1; then
  pass "npm run build"
else
  fail "npm run build — fix build errors before pushing"
fi

header "4. Test Suite (vitest)"
if npx vitest run 2>&1; then
  pass "All tests pass"
else
  fail "Tests failing — fix before pushing"
fi

header "5. Format Check (Prettier)"
if npx prettier --check 'src/' 'tests/' 2>&1; then
  pass "Prettier check"
else
  fail "Formatting issues — run 'npx prettier --write src/ tests/'"
fi

header "6. Lint (ESLint)"
if npx eslint 'src/' 'tests/' 2>&1; then
  pass "ESLint clean"
else
  fail "Lint errors — fix before pushing"
fi

header "7. npm Audit"
if npm audit --audit-level=high 2>&1; then
  pass "npm audit clean"
else
  skip "npm audit found issues (non-blocking)"
fi

echo ""
if $PASS; then
  echo -e "${GREEN}━━━ ✅ ALL CHECKS PASSED — ready to push ━━━${NC}"
  exit 0
else
  echo -e "${RED}━━━ ❌ SOME CHECKS FAILED — fix before pushing ━━━${NC}"
  exit 1
fi
