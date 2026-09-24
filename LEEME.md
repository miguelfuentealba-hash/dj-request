# DJ Request 🎧

App para que el público pida canciones escaneando un QR y pueda invitarte una cerveza 🍺.

## Cómo se usa
1. Doble clic en **`Iniciar DJ Request.command`** (la 1ª vez: clic derecho → Abrir, y permitir conexiones entrantes a `node`).
2. Se abren dos pestañas:
   - **Panel DJ** (`/dj`): el PIN aparece en la ventana de Terminal. Puedes cambiarlo en ⚙️ Ajustes.
   - **Pantalla QR** (`/qr`): proyéctala o imprímela (botón 🖨 al pasar el mouse).
3. En ⚙️ Ajustes pon tu nombre, el link de pago (Mercado Pago, PayPal.me…) y/o tus datos de transferencia.
4. Para apagar, cierra la ventana de Terminal.

## Panel DJ
- Pendientes → ✓ Aceptar / ▶ Sonando / ✕ Rechazar. ▶ marca como "tocada" la canción que estaba sonando.
- 📋 copia "título artista" para buscarla en rekordbox.
- Si varias personas piden la misma canción, se juntan en un solo pedido con más votos 🔥.
- Aviso con sonido cuando llega un pedido o una cerveza (🔔/🔕 lo apaga).
- "Pedidos abiertos/cerrados" pausa los pedidos nuevos.
- Ajustes → "Nueva noche" borra todo.

## Propinas
La app **no procesa pagos**: muestra tu link de pago y/o tus datos de transferencia.
El botón "Ya te la envié 🍻" solo te avisa, así que confirma los pagos en tu app del banco.

## Buscador
Al escribir la canción aparecen sugerencias del catálogo de iTunes (con carátula); al tocar una se completan título y artista.
Si no hay internet, se puede escribir a mano igual. País del catálogo: variable `SEARCH_COUNTRY` (por defecto `CL`).

## Red
- **En tu Mac:** el QR apunta a la IP de tu Mac → el público debe estar en la misma WiFi.
- **En la nube (Render):** funciona con datos móviles. Ver pasos abajo.

## Subir a Render (gratis)
1. Sube esta carpeta a un repositorio de GitHub (no se sube `data.json`).
2. En render.com → **New → Blueprint** → elige el repositorio (usa `render.yaml`).
3. Te pedirá **DJ_PIN**: pon un PIN largo (ej. `cumbia-2026-miky`). Está en internet, así que no uses uno de 4 dígitos.
4. Tu app queda en `https://dj-request-XXXX.onrender.com` (panel: `/dj`, QR: `/qr`). El QR usa esa dirección solo.

**Ojo con el plan gratis:**
- Se duerme tras 15 min sin visitas (tarda ~1 min en despertar). Con el Panel DJ abierto se mantiene despierto.
- **No guarda archivos**: si se reinicia o haces un deploy, se pierden los pedidos *y los ajustes*.
  Para que los ajustes no se pierdan, ponlos como variables de entorno en Render (Environment):
  `DJ_NAME`, `TIP_URL`, `TIP_LABEL`, `TIP_AMOUNT`, `BANK_NOMBRE`, `BANK_RUT`, `BANK_BANCO`, `BANK_TIPO`, `BANK_CUENTA`, `BANK_EMAIL`.
- Con el plan pagado (Starter + disco persistente con `DATA_DIR=/var/data`) no se duerme y guarda todo.

Los datos se guardan en `data.json` (se crea al arrancar; en la nube, en `DATA_DIR`).
