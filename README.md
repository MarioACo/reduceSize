# ReduceSize

Aplicación web local para comprimir imágenes y obtener recomendaciones de tamaño para otros tipos de archivo.

## Abrir

Abre `index.html` en un navegador moderno. No necesita instalación, cuenta ni conexión a internet.

## Funciones

- Compresión real de JPG, PNG y WEBP en el navegador.
- Tres ajustes rápidos y un control de calidad personalizado.
- Perfiles guiados para WhatsApp, correo y trámites, web o tienda e impresión.
- Objetivo de peso exacto en KB o MB con ajuste automático de calidad y resolución.
- Redimensionamiento automático o sugerido para redes sociales, correo/trámites y web/tienda.
- Medidas manuales máximas con proporción bloqueada para evitar deformaciones.
- Los controles de compresión y redimensionamiento se ocultan cuando el lote solo contiene video, PDF, audio, documentos o ZIP.
- En lotes mixtos, la interfaz indica cuántas imágenes se modificarán y qué archivos recibirán únicamente recomendaciones.
- Redimensionado inteligente para evitar archivos enormes.
- Comparación de tamaño original, tamaño final y ahorro total.
- Comparador visual interactivo antes/después y valoración comprensible de calidad.
- Eliminación opcional de ubicación GPS, fecha, cámara y demás metadatos al recrear la imagen.
- Descarga individual o de todas las imágenes procesadas.
- En Android usa el selector de ubicación cuando el navegador lo admite.
- En iPhone y iPad descarga directamente a `Archivos → Descargas`, ya que Safari no permite a una web abrir un selector de carpetas.
- Exportación alternativa para versiones de Safari que no admiten WEBP o `canvas.toBlob`.
- Recomendaciones para PDF, video, audio, documentos y archivos comprimidos.
- Procesamiento privado: los archivos no salen del dispositivo.

> Los PDF, videos, audios y documentos se analizan para sugerir un rango adecuado, pero no se modifican. La compresión real integrada corresponde a imágenes.
