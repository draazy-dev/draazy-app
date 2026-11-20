#!/usr/bin/env bash
# Sets <PREFIX>_* deploy secrets at repo level (a private repo on GitHub Free has no environment secrets).
# Values are read silently or generated locally and piped to gh; nothing is echoed or written to disk.
# Usage: bash scripts/set-repo-secrets.sh SANDBOX|PROD   (needs gh logged in as a repo admin)
set -euo pipefail
P=${1:?usage: set-repo-secrets.sh SANDBOX|PROD}
REPO=draazy-dev/draazy-app

# [!]name|kind|note   ! = no prefix. kind: b48 / b32 = generate N random bytes as base64, paste = copy from a dashboard
SECRETS="
JWT_SECRET|b48|regenerating signs everyone out
REFERRAL_SIGNAL_SALT|b48|
IDENTITY_HASH_SECRET|b48|regenerating breaks duplicate-identity matching on existing rows
IDENTITY_ENCRYPTION_KEY|b32|regenerating makes stored PAN/Aadhaar unreadable
STAFF_TOTP_KEY|b32|regenerating forces every staff account to reset 2FA
ORIGIN_SHARED_SECRET|b48|must match ORIGIN_SHARED_SECRET on the Cloudflare Pages project
WHATSAPP_WEBHOOK_VERIFY_TOKEN|b48|must match the verify token in the Meta webhook settings
BOOTSTRAP_ADMIN_EMAIL|paste|
BOOTSTRAP_ADMIN_MOBILE|paste|
CASHFREE_APP_ID|paste|Cashfree > Developers > API keys
CASHFREE_SECRET_KEY|paste|Cashfree > Developers > API keys
GOOGLE_PLACES_SERVER_KEY|paste|Google Cloud > Credentials
R2_ACCESS_KEY_ID|paste|Cloudflare > R2 > Manage API tokens
R2_SECRET_ACCESS_KEY|paste|Cloudflare > R2 > Manage API tokens
TURNSTILE_SECRET_KEY|paste|Cloudflare > Turnstile > site > Settings
WHATSAPP_ACCESS_TOKEN|paste|Meta System User token (the dashboard token expires in 24 h)
WHATSAPP_APP_SECRET|paste|Meta app > Settings > Basic
ZEPTOMAIL_API_KEY|paste|ZeptoMail > Mail Agent > SMTP/API
ZEPTOMAIL_WEBHOOK_KEY|paste|ZeptoMail > Webhooks
PUSH_VAPID_PUBLIC_KEY|paste|keep the old pair if you have it (npx web-push generate-vapid-keys); must match VITE_VAPID_PUBLIC_KEY
PUSH_VAPID_PRIVATE_KEY|paste|
!DIGITALOCEAN_ACCESS_TOKEN|paste|DO > API > Tokens; shared by every environment
!CLOUDFLARE_API_TOKEN|paste|Cloudflare token with only Account > Cloudflare Pages > Edit
!GHCR_PULL_CREDENTIALS|paste|draazy-india:<classic PAT with only read:packages>; DO pulls the private image with it
"

existing=$(gh secret list -R "$REPO" --json name -q '.[].name')
while IFS='|' read -r name kind note; do
  [ -z "$name" ] && continue
  if [ "${name#!}" != "$name" ]; then full=${name#!}; else full="${P}_${name}"; fi
  grep -qx "$full" <<<"$existing" && { echo "= $full already set at repo level"; continue; }
  echo; echo "$full${note:+  ($note)}"
  if [ "$kind" = paste ]; then prompt="[p]aste / [s]kip: "; else prompt="[g]enerate / [p]aste / [s]kip: "; fi
  read -rp "  $prompt" choice </dev/tty
  case "$choice" in
    g|G) [ "$kind" = paste ] && { echo "  skipped"; continue; }
         openssl rand -base64 "${kind#b}" | tr -d '\n' | gh secret set "$full" -R "$REPO" ;;
    p|P) read -rsp "  value (hidden): " v </dev/tty; echo
         [ -z "$v" ] && { echo "  empty, skipped"; continue; }
         printf %s "$v" | gh secret set "$full" -R "$REPO"; unset v ;;
    *)   echo "  skipped"; continue ;;
  esac
  echo "  set"
done <<<"$SECRETS"

echo; echo "Repo-level secrets with prefix ${P}_:"
gh secret list -R "$REPO" --json name -q ".[].name|select(startswith(\"${P}_\"))"
