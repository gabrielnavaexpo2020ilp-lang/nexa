# NEXA · página, pedidos y asistente para un negocio

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `site.css`, `site.js` | La página del negocio que ven los clientes: portada, menú, pedido para recoger y asistente. |
| `equipo.html`, `panel.css`, `panel.js` | Panel del equipo: resumen del día, bandeja de preguntas, tablero de pedidos, respuestas guardadas, datos del negocio y código QR. |
| `nexa.js` | Núcleo compartido: conexión a Firebase, respuestas del asistente, horario, estilos. |
| `database.rules.json` | Reglas de seguridad de Firebase (hay que pegarlas una vez). |
| `worker/worker.js` | Servicio opcional para que el asistente responda con IA. |

## 1. Reglas de seguridad (obligatorio, 5 minutos)

1. Entra a console.firebase.google.com, proyecto **nexa-c5176**.
2. **Authentication > Users**: copia el "User UID" de la cuenta del equipo.
3. **Realtime Database > Datos**: crea el nodo `equipo`, y dentro una clave con ese UID y valor `true`.
4. **Realtime Database > Reglas**: borra lo que hay, pega el contenido de `database.rules.json` y publica.
5. **Authentication > Settings > User actions**: desactiva "Enable create (sign-up)" para que nadie más pueda crear cuentas.

Con esto: cualquiera lee el menú, un cliente solo crea sus propias preguntas y pedidos, y solo el equipo responde, avanza pedidos y edita datos. Sin el paso 4 los pedidos no llegan al panel (la página los manda por WhatsApp como respaldo).

## 2. Datos del negocio

En el panel, pestaña **Mi negocio**. Productos, uno por línea:

```
# Café
Latte - $60 - Espresso doble con leche vaporizada
```

`# Nombre` abre una sección del menú. El horario escrito como "Lunes a sábado de 8:00 a 20:00" activa el aviso de abierto o cerrado. "Estilo de tu página" cambia colores y tipografía según el giro.

## 3. Respuestas con IA (opcional)

Sin esto, el asistente responde con los datos del negocio y lo que el equipo le enseñó. Con esto, entiende preguntas escritas de cualquier forma, y sigue pasando al equipo lo que no sabe.

1. Crea una cuenta gratis en dash.cloudflare.com > Workers > Create > pega `worker/worker.js`.
2. En Settings > Variables and Secrets agrega `ANTHROPIC_API_KEY` (secreto), `MODELO`, `ORIGEN` y `DB` (los valores van en el comentario del archivo).
3. Copia la dirección del Worker y pégala en `NEXA_AI_URL`, al inicio de `nexa.js`.

La llave de la API cuesta según el uso; nunca la pongas en `nexa.js`, solo en el Worker.

## Probar en la Mac

```
cd nexa
python3 -m http.server 8000
```

Abre http://localhost:8000 (clientes) y http://localhost:8000/equipo.html (equipo).
