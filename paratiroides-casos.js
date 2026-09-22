/* Casos de paratiroides del tutorial. Este archivo es identico en spect-lab-95 y en
   visor_dicom: el simulador guia la primera parte y el visor la segunda, y los dos leen de
   aqui que archivos esperan y que cuenta cada caso.

   Los datos tecnicos salieron de los DICOM reales. El marco de referencia de cada fase se
   guarda como hash FNV-1a de 32 bits del FrameOfReferenceUID: basta para reconocer si el
   alumno cargo el archivo de la fase correcta y no publica identificadores del PACS.
   La clinica esta desidentificada: sin nombres, RUT, fechas ni firmas. */
'use strict';
function paratiroidesHash(texto){
 let h=0x811c9dc5;
 for(const byte of new TextEncoder().encode(String(texto||''))){h^=byte;h=Math.imul(h,0x01000193)>>>0;}
 return h.toString(16).padStart(8,'0');
}
const PARATIROIDES_RECETA={iteraciones:2,subconjuntos:8,ac:true,filtroMm:8.4};
const PARATIROIDES_CORTES={distanciaMm:3,grosorMm:3,plano:'axial'};
const PARATIROIDES_VISOR='https://lucianotejadac.github.io/visor_dicom/';
const PARATIROIDES_SIMULADOR='https://lucianotejadac.github.io/spect-lab-95/';
const PARATIROIDES_FASES=['precoz','tardio'];
const PARATIROIDES_NOMBRE_FASE={precoz:'precoz',tardio:'tardío'};
const PARATIROIDES_CASOS={
 1:{
  titulo:'Adenoma inferior izquierdo',
  resumen:'El caso de referencia: dos fases completas, cada una con su CT diagnóstico de 1.5 mm.',
  clinica:{
   antecedentes:'79 años. Hiperparatiroidismo en estudio. PTH 148,7 pg/mL. No se dispone de estudios morfológicos para comparar.',
   procedimiento:'Tc-99m sestamibi, 26,4 mCi por vía endovenosa. Imágenes planares cervicales precoz y tardía, con SPECT en ambas fases y CT de baja dosis para localización.',
   hallazgos:'En la planar precoz, captación relativamente simétrica de la glándula tiroides con leve extensión hacia inferior del polo inferior del lóbulo izquierdo. En la tardía, lavado completo de la tiroides con persistencia de un área hipercaptante inferior izquierda. En el SPECT precoz y tardío, el foco inferior izquierdo se correlaciona con una imagen nodular de unos 9 mm, inferior al polo tiroideo inferior ipsilateral. Sin otros focos sospechosos.',
   impresion:'Foco de tejido paratiroideo hiperfuncionante caudal al polo inferior del lóbulo tiroideo izquierdo, en correlación con una imagen nodular: sugerente de adenoma paratiroideo. Se sugiere complementar con estudio morfológico dirigido.'
  },
  particularidades:[
   'Es el caso de referencia: 60 vistas por cabezal cada 3° y dos CT diagnósticos de 1.5 mm (247 y 235 cortes).',
   'Lo que buscas está caudal al polo inferior del lóbulo tiroideo izquierdo, y debe persistir en la fase tardía cuando la tiroides ya lavó.'
  ],
  fases:{
   precoz:{carpetaNm:'archivo «precoz», suelto en la carpeta del caso',carpetaCt:'ct precoz anom',nm:{frames:240,vistas:60,pasoGrados:3,marco:'09c8b716'},ct:{cortes:247,dzMm:1,pixelMm:0.547,espesorMm:1.5,kernel:'B50s',marco:'09c8b716'},
    guia:'La tiroides capta de forma bastante simétrica. Busca una extensión de la captación hacia caudal del polo inferior del lóbulo izquierdo: en axial, baja corte a corte por debajo de la tiroides.'},
   tardio:{carpetaNm:'archivo «tardio», suelto en la carpeta del caso',carpetaCt:'ct tardio anom',nm:{frames:240,vistas:60,pasoGrados:3,marco:'21f4ff52'},ct:{cortes:235,dzMm:1,pixelMm:0.629,espesorMm:1.5,kernel:'B50s',marco:'21f4ff52'},
    guia:'La tiroides ya lavó, así que el foco inferior izquierdo debe quedar solo y evidente. Sobre el CT corresponde a un nódulo de unos 9 mm bajo el polo inferior. Compara con la fase precoz: eso es el «lavado diferencial» del sestamibi.'}
  }
 },
 2:{
  titulo:'Sin foco paratiroideo, solo CT de atenuación',
  resumen:'No hay CT de buena resolución: solo los de atenuación, de 3 mm. Y el estudio es negativo.',
  clinica:{
   antecedentes:'68 años. Hiperparatiroidismo en estudio. Ecografía tiroidea previa con nódulos tiroideos bilaterales TIRADS 3.',
   procedimiento:'Tc-99m sestamibi, 21,5 mCi por vía endovenosa. Imágenes cervicales planares precoz y tardía, y SPECT con CT de baja dosis para localización.',
   hallazgos:'En la planar precoz, captación simétrica de la tiroides sin focos hiper ni hipocaptantes definidos. En la tardía, lavado completo sin focos sospechosos. En el SPECT, áreas nodulares hipodensas bilaterales en la tiroides, sin lesiones nodulares hipercaptantes retrotiroideas, cervicales ni extracervicales. Menor captación fisiológica de la glándula submandibular derecha, que pudiera corresponder a hipofunción.',
   impresion:'Estudio sin evidencia de focos hipercaptantes sospechosos de tejido paratiroideo hiperfuncionante a nivel cervical ni extracervical.'
  },
  particularidades:[
   'A diferencia de los otros casos, no hay CT de buena resolución: solo los CT de atenuación, de 3 mm de corte (85 y 82 cortes) y kernel blando B08s. La fusión saldrá tosca y ese CT no sirve para caracterizar nódulos.',
   '32 vistas por cabezal cada 5.625° en vez de 60: proyecciones más ruidosas que en los demás casos.',
   'Un estudio negativo también hay que saber informarlo: el objetivo es demostrar que no hay foco, no encontrar uno a la fuerza.'
  ],
  registro:'Este CT es de atenuación: baja dosis, cortes de 3 mm y kernel blando, así que se ve borroso. Para el registro usa el preajuste «Contorno externo» de la ventana TC y guíate por la piel del cuello, no por el hueso.',
  fases:{
   precoz:{carpetaNm:'carpeta «nm precoz»',carpetaCt:'ct precoz ac',nm:{frames:128,vistas:32,pasoGrados:5.625,marco:'dc2a4f21'},ct:{cortes:85,dzMm:3,pixelMm:0.977,espesorMm:3,kernel:'B08s',marco:'dc2a4f21'},
    guia:'Tiroides con captación simétrica y sin focos definidos. Fíjate en las glándulas submandibulares: la derecha capta menos que la izquierda. Con 32 vistas la imagen es más ruidosa; sube el umbral inferior antes de decidir que algo es un foco.'},
   tardio:{carpetaNm:'carpeta «nm tardio»',carpetaCt:'ct tardio ac',nm:{frames:128,vistas:32,pasoGrados:5.625,marco:'aade3374'},ct:{cortes:82,dzMm:3,pixelMm:0.977,espesorMm:3,kernel:'B08s',marco:'aade3374'},
    guia:'Lavado completo, sin focos que persistan. Este es el momento de aprender a no inventar: con el umbral demasiado bajo cualquier ruido parece un foco. El CT de 3 mm muestra nódulos hipodensos tiroideos bilaterales que no captan.'}
  }
 },
 3:{
  titulo:'Adenoma ectópico retrotraqueal',
  resumen:'La lesión no está donde uno la busca: mediastino superior, retrotraqueal, a la altura de T3.',
  clinica:{
   antecedentes:'Hiperparatiroidismo primario. PTH 184 pg/mL. Nódulo tiroideo derecho sospechoso, en espera de biopsia. Hipotiroidismo en tratamiento. Se dispone de ecotomografía tiroidea reciente.',
   procedimiento:'Tc-99m MIBI, 27,7 mCi por vía endovenosa. Imágenes planares y SPECT/CT de cuello y tórax superior a los 15 y 90 minutos, con CT sin contraste para localización anatómica.',
   hallazgos:'Nódulo alargado con intensa hipercaptación en el mediastino superior, en situación retrotraqueal a la altura de T3, cuya captación persiste en la imagen tardía; mide unos 20 × 9 mm en el plano transaxial y 28 mm en el eje cefalocaudal. Tiroides en posición normal, con una imagen nodular levemente hipercaptante en el lóbulo derecho que corresponde al nódulo descrito en la ecografía; el resto de la glándula es de aspecto atrófico.',
   impresion:'Lesión paratiroidea hiperfuncionante ectópica en el mediastino superior, en situación retrotraqueal. Nódulo tiroideo derecho levemente hipercaptante, ya conocido por ecografía.'
  },
  particularidades:[
   'Adquisición y CT como en el caso 1: 60 vistas cada 3° y dos CT de 1.5 mm (251 cortes cada uno).',
   'La lesión es ectópica: mediastino superior, retrotraqueal, a la altura de T3. En la fusión y en el MIP hay que bajar más de lo habitual y mirar detrás de la tráquea.',
   'Hay además un nódulo tiroideo derecho levemente captante que compite por la atención: no es la lesión principal.'
  ],
  fases:{
   precoz:{carpetaNm:'carpeta «precoz»',carpetaCt:'ct precoz',nm:{frames:240,vistas:60,pasoGrados:3,marco:'c1fa16de'},ct:{cortes:251,dzMm:1,pixelMm:0.633,espesorMm:1.5,kernel:'B50s',marco:'c1fa16de'},
    guia:'No te quedes en la tiroides. Baja en axial hasta el mediastino superior y mira detrás de la tráquea, a la altura de T3: hay un nódulo alargado con captación muy intensa. En el MIP se ve de inmediato como el foco más caliente, por debajo del cuello. En el lóbulo tiroideo derecho hay además un nódulo levemente captante.'},
   tardio:{carpetaNm:'carpeta «tardio»',carpetaCt:'ct tardio',nm:{frames:240,vistas:60,pasoGrados:3,marco:'50733b9c'},ct:{cortes:251,dzMm:1,pixelMm:0.635,espesorMm:1.5,kernel:'B50s',marco:'50733b9c'},
    guia:'El foco retrotraqueal persiste con la tiroides ya lavada. En el CT mide unos 20 × 9 mm en axial y 28 mm de cabeza a pies: úsalo para recorrerlo en coronal y sagital. Un adenoma en este sitio cambia la cirugía, por eso importa localizarlo bien.'}
  }
 },
 4:{
  titulo:'Adenoma inferior izquierdo con dos CT distintos',
  resumen:'El CT precoz es el de atenuación de 3 mm; el tardío es el 3D de 1.5 mm. Las dos fusiones no se verán igual.',
  clinica:{
   antecedentes:'Hiperparatiroidismo primario.',
   procedimiento:'Dosis estándar de Tc-99m MIBI (28 mCi). A los 20 minutos, SPECT-CT de la región cervical y el tórax; después, SPECT-CT tardío del mismo sitio.',
   hallazgos:'Tiroides con captación conservada y adecuado lavado en la fase tardía. En las imágenes SPECT-CT precoces, nódulo hipercaptante en el aspecto posterior del polo inferior del lóbulo tiroideo izquierdo, insinuándose en el surco traqueoesofágico, que persiste en el control tardío. Resto de los compartimentos cervicales con distribución habitual.',
   impresion:'Cintigrama de paratiroides MIBI SPECT-CT compatible con glándula paratiroides inferior izquierda hiperfuncionante (adenoma paratiroideo).'
  },
  particularidades:[
   'El CT del tardío tiene mucha mejor resolución y más cortes que el del precoz: 272 cortes de 1.5 mm contra 97 cortes de 3 mm con kernel blando. La fusión tardía será mucho más nítida; compárala con la precoz y explica por qué.',
   'El nódulo es posterior al polo inferior del lóbulo tiroideo izquierdo, metido en el surco traqueoesofágico: en axial hay que mirar detrás de la tiroides, no lateral a ella.'
  ],
  registro:'El CT precoz es el de atenuación, de 3 mm y kernel blando: se ve borroso. Para registrarlo usa el preajuste «Contorno externo» y guíate por la piel. En la fase tardía el CT es el diagnóstico de 1.5 mm y el registro se hace con el hueso.',
  fases:{
   precoz:{carpetaNm:'carpeta «precoz»',carpetaCt:'ct ac precoz',nm:{frames:240,vistas:60,pasoGrados:3,marco:'949c0270'},ct:{cortes:97,dzMm:3,pixelMm:0.977,espesorMm:3,kernel:'B08s',marco:'949c0270'},
    guia:'Nódulo hipercaptante posterior al polo inferior del lóbulo izquierdo, metido en el surco traqueoesofágico: en axial, detrás de la tiroides y no lateral a ella. Con este CT de 3 mm la correlación anatómica es gruesa; anótalo, porque en la fase tardía vas a ver la diferencia.'},
   tardio:{carpetaNm:'carpeta «tardio»',carpetaCt:'ct 3d tardio',nm:{frames:240,vistas:60,pasoGrados:3,marco:'7ee94b6a'},ct:{cortes:272,dzMm:1,pixelMm:0.652,espesorMm:1.5,kernel:'B50s',marco:'7ee94b6a'},
    guia:'El mismo foco persiste tras el lavado tiroideo, y ahora el CT de 1.5 mm deja ver el nódulo con nitidez. Genera los cortes fusionados de las dos fases y compáralos: la emisión es equivalente, lo que cambia es la calidad del CT.'}
  }
 },
 5:{
  titulo:'Foco dudoso paraesofágico; tardío reconstruido por el equipo',
  resumen:'El tardío no tiene proyecciones: viene ya reconstruido por el Symbia. Esa fase no se reconstruye aquí, se problematiza.',
  clinica:{
   antecedentes:'60 años. Observación de hiperparatiroidismo primario. PTH 266 pg/mL. Se dispone de informes de ecografía cervical y de un cintigrama de paratiroides previo negativo, realizados en otro centro.',
   procedimiento:'Tc-99m MIBI, 22,2 mCi, en equipo Symbia Intevo Bold. Planar en proyección anterior y SPECT-CT de cuello y tórax a los 15 y 90 minutos, con CT de baja dosis solo para localización anatómica.',
   hallazgos:'En el control inicial, tiroides en posición habitual; lóbulo derecho conservado; lóbulo izquierdo aumentado de tamaño por un nódulo que ocupa sus dos tercios inferiores, con captación similar al resto del parénquima. Foco alargado de leve captación en la región retrotiroidea izquierda, que se correlaciona con un nódulo paraesofágico izquierdo de unos 1,0 × 1,3 × 2 cm en el CT. En el control tardío, depuración del trazador en la tiroides con leve actividad residual en ambos lóbulos y sin focos de retención anormal, en especial en relación con el nódulo paraesofágico.',
   impresion:'Dudoso tejido paratiroideo levemente hiperfuncionante en la región retrotiroidea izquierda, a nivel paraesofágico: fija el MIBI en el control inicial pero no tiene el comportamiento esperado en el tardío. Podría corresponder a un adenoma ectópico. Se recomienda valorar con tomografía computada.'
  },
  particularidades:[
   'El tardío no tiene proyecciones: solo está la reconstrucción del propio equipo, con corrección de atenuación. En este simulador la fase tardía no se reconstruye; en el visor se carga directo y se compara con la OSEM que tú hiciste del precoz.',
   'Esa reconstrucción del equipo viene con la inclinación real del gantry, unos 0.6°. El visor la tolera y lo avisa: a 2.7 mm de vóxel, el desplazamiento en los extremos es menor que un vóxel.',
   '32 vistas cada 5.625°, como el caso 2. Y los dos CT tienen píxel distinto (0.887 y 0.777 mm): campos de visión diferentes en cada fase.',
   'El foco es dudoso por definición: capta en el precoz y no retiene en el tardío. Lo interesante es discutir por qué el informe igual lo describe.'
  ],
  fases:{
   precoz:{carpetaNm:'carpeta «precoz»',carpetaCt:'ct precoz',nm:{frames:128,vistas:32,pasoGrados:5.625,marco:'22de79f6'},ct:{cortes:205,dzMm:1,pixelMm:0.887,espesorMm:1.5,kernel:'B50s',marco:'22de79f6'},
    guia:'El lóbulo izquierdo está aumentado por un nódulo que ocupa sus dos tercios inferiores y capta igual que el resto. Lo que buscas es más discreto: un foco alargado de leve captación retrotiroideo izquierdo, paraesofágico, que en el CT corresponde a un nódulo de unos 1,0 × 1,3 × 2 cm. Sube la opacidad y baja el umbral con cuidado.'},
   tardio:{carpetaNm:'carpeta «reconstruccion siemens tardio»',carpetaCt:'ct tardio',nm:{frames:128,vistas:32,pasoGrados:5.625,marco:'e79a92e4',reconstruidaPorEquipo:true},ct:{cortes:205,dzMm:1,pixelMm:0.777,espesorMm:1.5,kernel:'B50s',marco:'e79a92e4'},
    guia:'Esta es la reconstrucción del equipo, no la tuya. La tiroides depuró con leve actividad residual y el nódulo paraesofágico no retiene: por eso el informe lo llama dudoso. Compárala con tu OSEM del precoz y separa qué diferencias son del paciente y cuáles del procesamiento.'}
  }
 }
};
// Nombre que encabeza el archivo exportado y la descripcion de la serie: es lo que permite
// al visor reconocer, leyendo el propio DICOM, que fase de que caso se cargo.
function paratiroidesNombre(caso,fase){return `Caso ${caso} ${fase}`;}
function paratiroidesReconoceNombre(descripcion,caso,fase){
 // El visor escribe el nombre con guiones bajos en vez de espacios; se normaliza antes.
 const texto=String(descripcion||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_-]+/g,' ');
 // Tolera "Caso1precoz" y "caso 1 - precoz": lo que importa es el numero y la fase.
 return new RegExp(`caso\\s*${caso}(?!\\d).*${fase}`,'i').test(texto);
}
