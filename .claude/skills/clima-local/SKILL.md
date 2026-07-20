---
name: clima-local
description: Consulta el clima actual (temperatura, sensación térmica, estado, humedad, viento y precipitación) de una ubicación. Úsala cuando el usuario pida el tiempo/clima local o de una ciudad concreta. Sin args usa Valencia, España.
---

# clima-local

Devuelve el clima actual de una ubicación de forma concisa.

## Ubicación

- Si `args` trae una ciudad/lugar, úsalo (ej. `Madrid`, `Barcelona,Spain`, `Berlin`).
- Si `args` está vacío, usa **`Valencia,Spain`** por defecto.

## Cómo obtener los datos

Usa WebFetch contra la API JSON de wttr.in (no requiere clave, es fiable y no depende
de que WebSearch esté disponible en la región):

```
https://wttr.in/<UBICACION>?format=j1&lang=es
```

Sustituye `<UBICACION>` por el lugar codificando espacios (ej. `Valencia,Spain`).
En el prompt de WebFetch pide extraer del bloque `current_condition`:
temperatura (°C), sensación térmica (`FeelsLikeC`), descripción del tiempo,
humedad, velocidad del viento y precipitación (mm).

Si wttr.in falla o no responde, avisa al usuario en lugar de inventar datos.

## Formato de salida

Responde en español, breve, con este formato:

```
🌤️ Clima en <Ubicación> (<hora observación>)
- Temperatura: X °C (sensación de Y °C)
- Estado: <descripción>
- Humedad: Z %
- Viento: N km/h del <dirección>
- Precipitación: M mm
```

Cierra con una frase corta interpretando las condiciones (calor, frío, lluvia, etc.).
