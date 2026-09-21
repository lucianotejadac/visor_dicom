# Volumina · visor DICOM local

Abre `index.html` en Chrome o Edge y pulsa **Cargar demo** o **Abrir DICOM**. No requiere instalación ni servidor. Los archivos se procesan en memoria y no se envían a ningún servicio. La biblioteca está incluida localmente.

## Funciones

- MPR axial, coronal y sagital, con proporciones físicas y referencias sincronizadas.
- Ventana/nivel y presets. Rueda para recorrer cortes; clic para mover las referencias.
- MIP del volumen completo y VRT por ray casting WebGL2. Arrastrar para girar; rueda para zoom.
- Umbral y opacidad de VRT. La rampa de color VRT se controla con el umbral y el ancho de ventana; el nivel se utiliza en MPR/MIP.
- Selección de series, orden físico por ImagePositionPatient y validación del espaciado.
- Generación de cortes axiales, coronales y sagitales con distancia y grosor indicados, y exportación como serie DICOM.
- Fantoma sintético incluido, sin información de pacientes.

## Ampliar vistas y zoom MPR

- **Doble clic** en cualquiera de las cuatro vistas: amplía ese panel dentro del área de visualización. Otro doble clic, **Esc** o **Volver a las cuatro vistas** restaura la cuadrícula. Los controles no activan la ampliación al recibir doble clic.
- **Clic en el margen negro de un MPR y rueda**: activa el zoom de ese plano. También puedes mantener pulsado desde el margen y arrastrar hacia arriba para acercar o hacia abajo para alejar.
- **Clic dentro de la imagen**: sitúa las referencias y vuelve al modo de recorrido de cortes con la rueda. La rueda directamente sobre el margen también permite zoom sin activarlo antes.
- Cada MPR tiene zoom independiente (25–800 %), centrado en la imagen. Un borde de 12 píxeles sigue disponible para iniciar zoom incluso cuando la imagen está recortada por la ampliación. El CT, el SPECT y las referencias comparten la misma transformación de pantalla.
- **Restablecer vistas** vuelve al 100 % y al centro de los cortes. Cargar otro volumen base también restablece el zoom MPR.

## Fusión SPECT / CT

1. Carga el CT con **Abrir DICOM** y selecciona su serie.
2. Pulsa **Abrir SPECT / xSPECT** para seleccionar archivos o **Abrir carpeta funcional** para seleccionar una carpeta completa, incluidos archivos sin extensión. Se admiten series NM reconstruidas y exportaciones PT clásicas (xSPECT/PET). Si cargas varias series, elige la correspondiente en **Serie funcional**.
3. La superposición aparece en axial, coronal y sagital cuando comparten un `FrameOfReferenceUID` no vacío y no hay identificadores de paciente contradictorios. Revisa siempre la correspondencia anatómica: compartir coordenadas no comprueba que el paciente no se haya movido.
4. Ajusta opacidad, umbral inferior y saturación superior. Los porcentajes se refieren al máximo positivo del volumen funcional reescalado. Se conserva `Units (0054,1001)` (con `Rescale Type` como alternativa si falta): BQML se muestra como Bq/ml. No se calcula SUV ni se valida la calibración del equipo. Fuera del campo funcional se ve solo el CT.

La fusión usa interpolación trilineal en coordenadas físicas LPS, respetando origen y espaciado distintos. No ajusta las imágenes por tamaño de matriz ni las centra automáticamente. **Cargar demo** muestra dos volúmenes sintéticos de distinta resolución con dos focos de actividad.

Si los marcos de referencia difieren o faltan, la fusión queda desactivada. Puedes habilitar **Ajuste manual de posición → Habilitar ajuste exploratorio**: ofrece solo traslación en milímetros (+L izquierda, +P posterior, +S superior), señalada como manual en los tres planos. No es registro automático ni permite corregir rotación o deformación. No lee matrices DICOM REG. Los identificadores de paciente contradictorios bloquean la fusión también en modo manual. Cambiar el volumen base elimina el SPECT y sus ajustes para evitar reutilizar una superposición anterior.

## SPECT / xSPECT en MIP y VRT

En **Reconstrucción 3D → Volumen 3D** puedes elegir la base, el SPECT/xSPECT cargado o **CT + SPECT fusionados**. Al cargar el volumen funcional junto a un CT, se selecciona inicialmente el SPECT solo; elige la opción de fusión para ver ambos. **Cargar demo** permite probarlo sin archivos.

También puedes abrir SPECT/xSPECT sin CT usando **Abrir SPECT / xSPECT** o **Abrir carpeta funcional**. Cuando no hay CT como base, se carga como volumen base y el 3D utiliza automáticamente la escala funcional.

- **MIP:** muestra la intensidad máxima a lo largo de cada rayo, con paleta de color o grises.
- **VRT:** acumula color y opacidad a lo largo del rayo para representar el volumen de actividad.
- **Umbral 3D** y **Saturación 3D**: porcentajes del máximo funcional, independientes de la ventana CT y de la escala de fusión MPR. Se muestran sus valores en la unidad DICOM, incluidos Bq/ml.
- **Opacidad VRT** ajusta la representación volumétrica; no interviene en MIP. El umbral VRT de la base se desactiva cuando se muestra una serie funcional.
- Arrastra para girar y usa la rueda para acercar. Cada fuente conserva su propia matriz y espaciado físico; no se remuestrea al CT para representarla sola.

### Fusión CT + SPECT en MIP/VRT

Selecciona **CT + SPECT fusionados**, después **MIP** o **VRT**:

- **MIP fusionado:** superpone el MIP SPECT en color sobre el MIP CT en grises. Cada máximo se calcula por separado a lo largo del mismo rayo; los máximos no necesariamente están a la misma profundidad.
- **VRT fusionado:** muestrea ambos volúmenes en la misma posición física y acumula conjuntamente sus contribuciones de color y opacidad, respetando la oclusión por profundidad. Si el CT oculta los focos, reduce **Opacidad VRT** (controla el CT en este modo).
- **Opacidad SPECT en fusión 3D** controla la contribución funcional en ambos modos; cero muestra solo la contribución CT. **Umbral 3D / Saturación 3D** se aplican al SPECT; ventana/nivel y umbral VRT de la base se aplican al CT.

Se usan dos texturas con matrices y espaciados propios y una transformación por origen, espaciado y traslación manual, respetando los centros de vóxel. El renderizado fusionado está limitado al campo del CT; fuera del campo SPECT se conserva únicamente CT. Requiere memoria GPU para ambos volúmenes.

La fusión 3D exige las mismas comprobaciones de paciente y marco de referencia que MPR. Si faltan coordenadas compartidas, no hay solapamiento o el ajuste manual es inválido, se bloquea con un mensaje; no presenta una superposición como si estuviera registrada. El ajuste manual usa los mismos desplazamientos L/P/S que MPR y se identifica en la cabecera. La casilla **Mostrar SPECT en MPR** solo afecta a MPR.

El SPECT mostrado **solo** en 3D continúa disponible sin compartir marco de referencia con el CT. No se ha verificado la fusión con el CT real del estudio suministrado; las pruebas de fusión utilizan geometrías sintéticas conocidas.

### DICOM SPECT admitido

NM `RECON TOMO`, MONOCHROME2 sin compresión, con la misma orientación axial estándar que el CT. Admite cortes individuales y multiframe con:

- Geometría en un único ítem de `Detector Information Sequence` (o a nivel superior si no hay ítems).
- `Frame Increment Pointer` apuntando únicamente a `Slice Vector`.
- `Slice Vector` consecutivo `1…N`, `Number of Slices = Number of Frames`, una ventana de energía y un detector reconstruido.
- `Spacing Between Slices` explícito y distinto de cero. Se respeta su signo para apilar los cortes.

No admite proyecciones de adquisición TOMO, imágenes planares, gated, frames reordenados, SPECT comprimido o reconstrucciones oblicuas. El soporte NM multiframe está comprobado con archivos sintéticos.

### Exportación xSPECT comprobada

La carpeta suministrada contiene una serie de 298 archivos sin extensión, codificados como **PT / PET Image Storage clásico** (`1.2.840.10008.5.1.4.1.1.128`), fabricante `SIEMENS NM`. Que el contenedor sea PT no identifica por sí solo la técnica de adquisición; el visor conserva la modalidad declarada y no etiqueta cualquier PT como xSPECT.

- Matriz 256 × 256 × 298; espaciado aproximado 2,53906 mm en los tres ejes.
- Explicit VR Little Endian, sin compresión, píxeles enteros de 16 bits sin signo; un corte por archivo.
- Orientación axial LPS estándar, posición por corte y marco de referencia presentes.
- RescaleSlope = 10, RescaleIntercept = 0, Units = BQML. Rango reescalado observado: 0–414890 Bq/ml.

Se verificaron la reconstrucción y la ruta de importación funcional con los 298 archivos originales, sin modificarlos ni copiarlos al proyecto. Las pruebas de interfaz utilizan un DOM/canvas simulado y una base CT sintética para comprobar la carga; **no se ha comprobado la alineación con el CT real ni la visualización en navegador de este estudio**.

El lector acepta PT clásico axial sin compresión, aplica el rescale de cada corte y rechaza series que mezclan unidades. Enhanced PET sigue sin soporte. Las comprobaciones de paciente y marco de referencia se mantienen también para PT.

Referencia de unidades: [DICOM PET Units y Rescale](https://dicom.nema.org/medical/dicom/2021d/output/chtml/part03/sect_C.8.9.html).

Referencias: [DICOM NM Multi-frame](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.4.8.html), [NM Detector](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.4.11.html) y [NM Reconstruction](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.4.13.html).

## Generar cortes DICOM

A partir de la serie cargada, **GENERAR CORTES** reconstruye planos nuevos y los exporta como serie DICOM.

1. **Ventana de trabajo:** el plano MPR desde el que planificas. Sobre él se dibujan las líneas de los cortes.
2. **Plano de salida:** uno de los dos perpendiculares a esa ventana. Desde axial se generan cortes coronales o sagitales; desde sagital, axiales o coronales; desde coronal, axiales o sagitales.
3. **Distancia entre cortes** y **grosor de corte**, en milímetros. Si el grosor supera la distancia, los cortes se solapan; si es menor, quedan huecos entre ellos; si es menor que el vóxel, el corte es un único plano interpolado y se avisa de ello.
4. **FoV** y **matriz**, como en syngo. El campo de visión se indica en milímetros y es cuadrado, centrado y medido de borde a borde; la matriz es el número de píxeles por lado: 64 × 64, 128 × 128, 256 × 256, 512 × 512 o 1024 × 1024. **El tamaño de píxel no se elige: es el resultado**, FoV dividido por matriz, y aparece en el resumen junto al peso de la exportación. Al cargar un volumen o cambiar de plano, el FoV se ajusta al cuadrado que cubre ese plano y la matriz a la mayor que no deja el píxel por debajo del vóxel. **FoV completo** vuelve a ese ajuste y **Centrar aquí** lleva el campo a la referencia de los MPR.
5. **Rango:** el volumen completo por omisión. Se acota arrastrando las dos líneas sobre la ventana de trabajo o escribiendo los milímetros en *Desde* y *Hasta*. **Rango completo** lo restablece.
6. **Generar** muestra la pila en el cuarto panel, junto a MIP y VRT. Es un visor de imágenes, no 3D: rueda o barra para recorrer los cortes, con número y posición en milímetros. El zoom funciona como en los MPR: rueda sobre el margen negro, o clic y arrastre hacia arriba desde el margen; dentro de la imagen la rueda sigue cambiando de corte. **Restablecer vistas** lo devuelve al 100 %.
7. **Exportar DICOM** escribe la serie.

El grosor se combina **en las intensidades originales**, antes de aplicar ventana, color y fusión: el promedio se calcula sobre HU y sobre Bq/ml, no sobre los píxeles ya coloreados. La combinación predeterminada es el promedio, con MIP y MinIP del slab como alternativas. Se toma una muestra por vóxel a lo largo del grosor, hasta 64. Las muestras que caen fuera del volumen se descartan; no se replica el borde.

Los cortes se calculan en coordenadas físicas LPS por interpolación trilineal, siempre con píxel cuadrado. Las dos líneas naranjas discontinuas marcan los límites del FoV en cada MPR que muestre uno de los dos ejes del plano de salida: con salida coronal, el límite izquierda-derecha se ve en axial y coronal, y el superior-inferior en coronal y sagital. Si la matriz deja el píxel por debajo del vóxel se avisa: interpola, no añade detalle real. Si el FoV excede el volumen, también se avisa del borde negro. El contenido puede ser el volumen base o la fusión CT + SPECT en color, con la ventana, la paleta, el umbral, la saturación y la opacidad que estén aplicados en ese momento.

### Formato de salida

Secondary Capture RGB (`1.2.840.10008.5.1.4.1.1.7`), Explicit VR Little Endian, 8 bits por canal, sin compresión, un archivo por corte. Cada corte lleva `ImagePositionPatient`, `ImageOrientationPatient`, `PixelSpacing`, `SliceThickness`, `SpacingBetweenSlices` y `SliceLocation`, junto al paciente, el estudio y el `FrameOfReferenceUID` de la serie de origen; la serie es nueva, con `SeriesInstanceUID` propio, `ImageType` `DERIVED\SECONDARY\REFORMATTED` y `DerivationDescription` con los parámetros usados. Los UID generados usan la raíz `2.25` derivada de UUID. Si el volumen de origen no trae `StudyInstanceUID`, se crea un estudio nuevo y se avisa.

En Chrome y Edge se elige una carpeta y los archivos se escriben uno a uno. En otros navegadores se descarga un ZIP sin compresión, con un límite de 384 MB.

**Son imágenes derivadas en color.** No conservan HU ni unidades funcionales, no llevan rescale y no sirven para medir ni para calcular actividad. Este mismo visor no vuelve a abrirlas como volumen: exige MONOCHROME2 y las rechaza. Se abren en Weasis, RadiAnt, Horos o un PACS como una serie de imágenes. Las series coronales y sagitales llevan su orientación real (`1\0\0\0\0\-1` y `0\1\0\0\0\-1`), que no es la axial estándar que acepta el lector.

## Alcance de esta versión

Prototipo experimental, sin validación clínica. Admite DICOM Part 10, una imagen por archivo o SPECT multiframe según lo descrito arriba, MONOCHROME2, píxeles enteros de 8/16 bits y transfer syntaxes Implicit VR Little Endian, Explicit VR Little Endian y Explicit VR Big Endian. Aplica RescaleSlope/Intercept. Solo acepta orientación axial LPS estándar `[1,0,0,0,1,0]`, sin tilt ni desplazamiento entre cortes. Espaciado regular, al menos dos cortes. Una falta de cortes que mantenga un espaciado regular no es detectable sin datos externos.

La generación de cortes produce imágenes derivadas en color; no escribe series cuantitativas, ni reformateo oblicuo, ni objetos DICOM distintos de Secondary Capture.

No incluye JPEG/JPEG-LS/JPEG2000/RLE, multiframe fuera del subconjunto SPECT descrito, series oblicuas, MPR oblicuo, PET SUV, registro automático, segmentación, medidas, PACS ni DICOMweb. Las unidades de intensidad son las del rescale del archivo; no se presupone HU fuera de CT. El VRT usa una rampa ilustrativa, no segmentación anatómica. MIP recorre el volumen; no hay slab configurable.

La selección completa se rechaza si contiene archivos incompatibles, para evitar reconstruir series parciales. Selecciona solamente imágenes compatibles (sin DICOMDIR, PDF, informes o localizadores). Las series con duplicados o geometría inconsistente se rechazan. Límite de selección: 512 MB de píxeles decodificados; la memoria real requerida es mayor. El límite 3D depende de la GPU; MPR puede seguir disponible si falla la carga 3D.

## Tecnología y licencias

HTML/CSS/JavaScript, canvas 2D y WebGL2. Parser: [dicom-parser 1.8.21](https://github.com/cornerstonejs/dicomParser), licencia MIT incluida en `vendor/LICENSE-dicom-parser`. Texturas 3D: [WebGL2 texImage3D](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/texImage3D).

## Pruebas

`node tests.cjs`: 58 pruebas con archivos DICOM sintéticos y volúmenes de referencia. Incluyen lectura, rescale, orden físico, SPECT multiframe, interpolación, identificación y rechazo de geometrías inválidas, PT clásico, BQML, transformación entre coordenadas físicas y texturas 3D, geometría del reformateo por plano, FoV y matriz de salida, combinación del grosor, escritura Secondary Capture comprobada con el lector y el contenedor ZIP.

`node tests-ui.cjs`: 59 pruebas de integración con un DOM/canvas simulado. Verifican los buffers MPR, controles de fusión, referencias, etiquetas PT/Bq/ml, selección de fuente 3D, independencia de escalas, bloqueo por registro, ampliación de los cuatro paneles, zoom por margen, coordenadas de clic después del zoom, planificación de cortes, arrastre del rango, FoV y matriz de salida, la pila generada en el cuarto panel, su zoom por margen y la identidad de paciente y estudio de la serie exportada. No sustituyen la comprobación visual en navegador.

`python tests-shader.py`: 19 comprobaciones de renderizado con los shaders exactos de la aplicación en OpenGL fuera de pantalla, utilizando datos sintéticos. Comprueban MIP/VRT individuales y fusionados, paletas, umbral, opacidad, escalas hasta 414890 Bq/ml, resoluciones distintas, desplazamientos y ausencia de color fuera del campo SPECT. Dependencia de pruebas: `python -m pip install --target .test-tools moderngl`. La aplicación HTML no necesita Python ni esta dependencia. Estas pruebas no cubren la integración WebGL del navegador.

`node tests-ui.cjs "ruta a carpeta PT"`: añade una prueba local de importación funcional de los archivos reales con base CT sintética, sin guardar imágenes ni imprimir datos del paciente.

`node inspect-format.cjs "ruta a carpeta DICOM"`: auditoría local de formato, geometría, compatibilidad y rango de intensidades. No muestra atributos de paciente ni UIDs de instancia. Solo lee archivos.
