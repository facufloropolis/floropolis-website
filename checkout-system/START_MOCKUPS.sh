#!/bin/bash
# Levanta el dev server y abre los mockups directamente
# Ejecutar desde cualquier lugar: bash ~/Desktop/floropolis-upgrade/checkout-system/START_MOCKUPS.sh

cd "$(dirname "$0")/.." || exit 1

echo ""
echo "🌹 Floropolis — Levantando mockups del sistema de checkout..."
echo ""

# Kill cualquier proceso en el puerto 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Levantar dev server
npm run dev &

# Esperar a que esté listo
sleep 5

# Abrir en el browser
open http://127.0.0.1:3000/mockups

echo ""
echo "✓ Listo. Abriendo http://127.0.0.1:3000/mockups"
echo ""
echo "  Pantallas disponibles:"
echo "  01 → http://127.0.0.1:3000/mockups/checkout"
echo "  02 → http://127.0.0.1:3000/mockups/admin-orders"
echo "  03 → http://127.0.0.1:3000/mockups/admin-order-detail"
echo "  04 → http://127.0.0.1:3000/mockups/admin-dispatch"
echo "  05 → http://127.0.0.1:3000/mockups/account-orders"
echo "  06 → http://127.0.0.1:3000/mockups/vendor-portal"
echo ""
echo "  Para detener el server: Control+C"
echo ""

wait
