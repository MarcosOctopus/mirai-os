#!/bin/bash
# Bateria do login pela Conta Mirai (MIRAI OS) — prova o caminho NOVO sem tocar
# no login antigo. Nada de segredo aqui: só status, destino e atributos.
APP=http://127.0.0.1:3333
PUB=https://app.miraitohope.com
D=$(mktemp -d); J=$D/jar
ok=0; tot=0

check(){ tot=$((tot+1)); if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "  ✅ $1"; else echo "  ❌ $1 — esperado [$3] veio [$2]"; fi; }
qp(){ python3 -c "import sys,urllib.parse as u;print(u.parse_qs(u.urlparse(sys.argv[1]).query).get(sys.argv[2],[''])[0])" "$1" "$2"; }
tot_ok(){ echo; echo "=== $ok/$tot ==="; }

echo "── 1) start manda para o Conta Mirai ──"
H=$(curl -s -D - -o /dev/null -m 10 -c $J "$APP/api/auth/mirai/start")
LOC=$(echo "$H" | grep -i '^location:' | tr -d '\r' | sed 's/^[Ll]ocation: *//')
echo "   destino: ${LOC%%\?*}"
check "destino é o authorize do Mirai" "${LOC%%\?*}" "https://id.miraitohope.com/v1/auth/authorize"
check "client_id do app" "$(qp "$LOC" client_id)" "${MIRAI_OIDC_CLIENT_ID:-cli_9ff6c84aba44535b20}"
check "redirect_uri registrada" "$(qp "$LOC" redirect_uri)" "https://app.miraitohope.com/api/auth/mirai/callback"
check "response_type" "$(qp "$LOC" response_type)" "code"
check "scope" "$(qp "$LOC" scope)" "openid email profile"
check "PKCE S256" "$(qp "$LOC" code_challenge_method)" "S256"
S1=$(qp "$LOC" state); N1=$(qp "$LOC" nonce); C1=$(qp "$LOC" code_challenge)
[ ${#S1} -ge 20 ] && check "state tem tamanho decente (${#S1})" "ok" "ok" || check "state fraco" "curto" "ok"
[ -n "$N1" ] && check "nonce vai junto" "ok" "ok" || check "sem nonce" "vazio" "ok"
[ ${#C1} -eq 43 ] && check "code_challenge = sha256 base64url (43)" "ok" "ok" || check "code_challenge estranho (${#C1})" "ruim" "ok"

echo
echo "── 2) bilhete no cookie, com as travas certas ──"
CK=$(grep mirai_ticket $J | awk '{print $7}')
SC=$(echo "$H" | grep -i '^set-cookie: mirai_ticket' | tr -d '\r')
case "$SC" in *HttpOnly*) check "HttpOnly" ok ok;; *) check "HttpOnly" faltou ok;; esac
case "$SC" in *Secure*) check "Secure" ok ok;; *) check "Secure" faltou ok;; esac
if echo "$SC" | grep -qi 'samesite=lax'; then check "SameSite=Lax" ok ok; else check "SameSite=Lax" "$SC" "SameSite=lax"; fi
case "$SC" in *Path=/api/auth/mirai*) check "Path só do callback" ok ok;; *) check "Path amplo demais" "$SC" "Path=/api/auth/mirai";; esac
[ -n "$CK" ] && check "bilhete é JWT (3 partes)" "$(echo $CK | awk -F. '{print NF}')" "3" || check "sem bilhete" vazio ok

echo
echo "── 3) volta sem bilhete ──"
L=$(curl -s -D - -o /dev/null -m 10 "$APP/api/auth/mirai/callback?code=x&state=y" | grep -i '^location:' | tr -d '\r')
case "$L" in *error=mirai_bilhete*) check "sem bilhete → recusa" ok ok;; *) check "sem bilhete → recusa" "$L" "error=mirai_bilhete";; esac

echo
echo "── 4) bilhete FORJADO (assinado com outra chave) ──"
F=$(cd /opt/data/mirai-app && node mint-ticket.mjs chave-errada 2>/dev/null)
L=$(curl -s -D - -o /dev/null -m 10 -H "Cookie: mirai_ticket=$F" "$APP/api/auth/mirai/callback?code=x&state=y" | grep -i '^location:' | tr -d '\r')
case "$L" in *error=mirai_bilhete*) check "assinatura estranha → recusa" ok ok;; *) check "assinatura estranha → recusa" "$L" "error=mirai_bilhete";; esac

echo
echo "── 5) bilhete legítimo + state TROCADO (CSRF) ──"
L=$(curl -s -D - -o /dev/null -m 10 -b $J "$APP/api/auth/mirai/callback?code=x&state=outro-state" | grep -i '^location:' | tr -d '\r')
case "$L" in *error=mirai_state*) check "state trocado → recusa" ok ok;; *) check "state trocado → recusa" "$L" "error=mirai_state";; esac

echo
echo "── 6) bilhete legítimo + state certo + código INVENTADO ──"
J2=$D/jar2
L2=$(curl -s -D - -o /dev/null -m 10 -c $J2 -b $J "$APP/api/auth/mirai/callback?code=codigo-inventado&state=$S1" | grep -i '^location:' | tr -d '\r')
case "$L2" in *error=mirai_*) check "Mirai recusa o código falso → sem sessão" ok ok;; *) check "Mirai recusa o código falso → sem sessão" "$L2" "error=mirai_*";; esac
check "NÃO nasceu sessão" "$(grep -c '	token	' $J2)$(grep -c $'\ttoken$' $J2)" "00"

echo
echo "── 7) o redirect_uri está registrado no serviço? (o destino do authorize) ──"
A=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$LOC")
echo "   authorize (sem sessão) → HTTP $A"
case "$A" in 302|303|200) check "serviço aceita o nosso cliente" ok ok;; *) check "serviço recusou o cliente" "$A" "302";; esac

echo
echo "── 8) o mesmo pelo domínio público ──"
LO=$(curl -s -D - -o /dev/null -m 15 "$PUB/api/auth/mirai/start" | grep -i '^location:' | tr -d '\r' | sed 's/^[Ll]ocation: *//')
echo "   start público → ${LO%%\?*}"
check "idêntico por fora" "${LO%%\?*}" "https://id.miraitohope.com/v1/auth/authorize"
check "redirect_uri certa por fora" "$(qp "$LO" redirect_uri)" "https://app.miraitohope.com/api/auth/mirai/callback"
echo "   /api/chat por fora → $(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST $PUB/api/chat) (401 = guarda)"
echo "   callback por fora sem bilhete → $(curl -s -o /dev/null -w '%{http_code}' -m 10 "$PUB/api/auth/mirai/callback?code=x&state=y")"
rm -rf $D
tot_ok