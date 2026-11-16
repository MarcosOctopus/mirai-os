#!/usr/bin/env bash
# Pulso do agendador do app — roda a cada minuto no host do Stage.
#
# Chama POST /api/agendador/rodar com o segredo compartilhado. O agendador
# executa só as agendas vencidas e empurra a próxima data; chamar duas vezes
# não duplica entrega.
#
# Instalar:
#   * * * * * /opt/mirai/stage-app/scripts/cron-agendador.sh >> /var/log/agendador-app.log 2>&1

set -u

URL="http://127.0.0.1:3000/api/agendador/rodar"
ENV_FILE="/opt/mirai/stage-app/.env.local"

SEGREDO="$(grep -m1 '^AGENDADOR_SEGREDO=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)"
if [ -z "$SEGREDO" ]; then
  echo "$(date -Is) ERRO: AGENDADOR_SEGREDO ausente em $ENV_FILE"
  exit 1
fi

RESPOSTA="$(curl -sS --max-time 60 -X POST "$URL" \
  -H "x-agendador-segredo: $SEGREDO" 2>&1)"

# Silêncio quando não há nada vencido — log só do que importa.
if echo "$RESPOSTA" | grep -q '"rodadas":0'; then
  exit 0
fi

echo "$(date -Is) $RESPOSTA"
