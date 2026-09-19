#!/usr/bin/env bash
# Checks a DEPLOYED instance from outside. Run after a Vercel deploy.
#
#   bash scripts/verify-deploy.sh https://your-project.vercel.app
#
# Everything here is unauthenticated on purpose: it checks the things that
# must be true before anyone signs in. The signed-in flows are covered by
# scripts/verify-demo.sh and by walking docs/DEMO-SCRIPT.md in a browser.
set -uo pipefail

B="${1:-}"
if [ -z "$B" ]; then
  echo "usage: bash scripts/verify-deploy.sh https://your-project.vercel.app" >&2
  exit 2
fi
B="${B%/}"

PASS=0; FAIL=0; WARN=0
# Case-insensitive: HTTP/2 lowercases header names, so a case-sensitive match
# reported a missing Content-Security-Policy that was actually present.
ck() { if grep -qi -- "$2" <<<"$3"; then echo "  PASS  $1"; PASS=$((PASS+1));
  else echo "  FAIL  $1"; echo "        wanted: $2"; echo "        got:    ${3:0:200}"; FAIL=$((FAIL+1)); fi; }
warn() { echo "  WARN  $1"; WARN=$((WARN+1)); }

echo "Checking $B"
echo

echo "== Reachability =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$B/api/health" || echo "000")
if [ "$CODE" = "000" ]; then
  echo "  FAIL  the deployment did not respond"
  echo "        Is the URL right, and has the first deploy finished?"
  exit 1
fi
echo "  PASS  the deployment responded"
PASS=$((PASS+1))

echo "== Configuration =="
H=$(curl -s --max-time 20 "$B/api/health")
if grep -q '"status":"ok"' <<<"$H"; then
  echo "  PASS  configuration is complete"; PASS=$((PASS+1))
  if grep -q '"durable":true' <<<"$H"; then
    echo "  PASS  session storage is durable"; PASS=$((PASS+1))
  else
    echo "  FAIL  session storage is NOT durable"
    echo "        Approvals will vanish between clicks. Attach Postgres (DEPLOY.md step 2)."
    FAIL=$((FAIL+1))
  fi
else
  echo "  FAIL  configuration is incomplete"
  echo "        $H"
  echo "        Set the environment variables in DEPLOY.md step 4."
  FAIL=$((FAIL+1))
fi

echo "== Anonymous access is refused =="
for path in /api/dashboard /api/emails /api/approvals /api/admin/members; do
  C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$B$path")
  if [ "$C" = "401" ] || [ "$C" = "403" ] || [ "$C" = "503" ]; then
    echo "  PASS  $path refuses anonymous access ($C)"; PASS=$((PASS+1))
  else
    echo "  FAIL  $path returned $C to an anonymous caller"; FAIL=$((FAIL+1))
  fi
done

echo "== No content leaks to an anonymous caller =="
BODY=$(curl -s --max-time 20 "$B/api/dashboard"; curl -s --max-time 20 "$B/api/emails")
LEAKED=0
for marker in "indication of interest" "take-private" "Clearwater" "acquisition" "@pacsun.example"; do
  if grep -qi -- "$marker" <<<"$BODY"; then
    echo "  FAIL  anonymous response mentions '$marker'"; FAIL=$((FAIL+1)); LEAKED=1
  fi
done
[ "$LEAKED" -eq 0 ] && { echo "  PASS  no synthetic content in anonymous responses"; PASS=$((PASS+1)); }

echo "== Transport and headers =="
case "$B" in
  https://*) echo "  PASS  served over HTTPS"; PASS=$((PASS+1)) ;;
  *) echo "  FAIL  not HTTPS; cookies are marked Secure and sign-in will fail"; FAIL=$((FAIL+1)) ;;
esac

HDRS=$(curl -sI --max-time 20 "$B/sign-in")
ck "content-security-policy is present" "ontent-Security-Policy" "$HDRS"
ck "x-frame-options denies framing"     "DENY"                   "$HDRS"
ck "x-content-type-options is set"      "nosniff"                "$HDRS"
grep -qi "strict-transport-security" <<<"$HDRS" \
  && { echo "  PASS  HSTS is present"; PASS=$((PASS+1)); } \
  || warn "no HSTS header (Vercel usually adds this; check if you use a custom domain)"

echo "== Sign-in is reachable =="
C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$B/sign-in")
if [ "$C" = "200" ]; then echo "  PASS  /sign-in renders ($C)"; PASS=$((PASS+1));
else echo "  FAIL  /sign-in returned $C"; FAIL=$((FAIL+1)); fi

C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$B/api/auth/providers")
if [ "$C" = "200" ]; then echo "  PASS  the auth provider endpoint responds"; PASS=$((PASS+1));
else echo "  FAIL  /api/auth/providers returned $C"; FAIL=$((FAIL+1)); fi

echo
echo "passed: $PASS   failed: $FAIL   warnings: $WARN"
echo
if [ "$FAIL" -eq 0 ]; then
  echo "Automated checks pass. Two things they cannot cover:"
  echo "  1. Google sign-in — open $B in a browser and sign in."
  echo "  2. The demo beats — walk docs/DEMO-SCRIPT.md once on this URL."
fi
[ "$FAIL" -eq 0 ]
