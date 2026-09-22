/* Tutorial de paratiroides, segunda parte: fusionar cada fase reconstruida con su CT,
   generar los cortes axiales fusionados y guardar la captura del MIP. Lee el estado del
   visor (volume, spect, fusionSample, slicePlan, mode) y escucha los eventos `volumina`
   que app.js y reformat-ui.js emiten; no toca la reconstruccion ni la escritura DICOM.
   Los casos viven en paratiroides-casos.js, el mismo archivo que usa el simulador. */
'use strict';
(()=>{
 const panel=$('tutorialParatiroides'),CLAVE='paratiroidesVisor';
 const estado={caso:null,fase:'precoz',hechos:{precoz:{},tardio:{}},plegado:false};
 const cortes=PARATIROIDES_CORTES;

 function guardar(){try{sessionStorage.setItem(CLAVE,JSON.stringify({caso:estado.caso,fase:estado.fase,hechos:estado.hechos}));}catch(err){}}
 function recuperar(){try{const g=JSON.parse(sessionStorage.getItem(CLAVE)||'null');if(g&&PARATIROIDES_CASOS[g.caso]){estado.caso=g.caso;estado.fase=PARATIROIDES_FASES.includes(g.fase)?g.fase:'precoz';estado.hechos={precoz:{},tardio:{},...(g.hechos||{})};}}catch(err){}}
 const caso=()=>PARATIROIDES_CASOS[estado.caso];
 const faseDatos=f=>caso().fases[f];
 const otraFase=f=>f==='precoz'?'tardio':'precoz';
 const nombreFase=f=>PARATIROIDES_NOMBRE_FASE[f];

 function pasos(f){
  const d=faseDatos(f),hechos=estado.hechos[f],nombre=paratiroidesNombre(estado.caso,f);
  const ctHash=volume&&volume.modality==='CT'?paratiroidesHash(volume.frame):null,ctOk=ctHash===d.ct.marco,ctOtra=ctHash===faseDatos(otraFase(f)).ct.marco;
  const spHash=spect?paratiroidesHash(spect.frame):null,spMarco=spHash===d.nm.marco,spOtra=spHash===faseDatos(otraFase(f)).nm.marco;
  const spNombre=d.nm.reconstruidaPorEquipo||(spect&&paratiroidesReconoceNombre(spect.description,estado.caso,f));
  const spOk=ctOk&&spMarco&&spNombre;
  const fusionOk=spOk&&!!fusionSample;
  const plan=typeof slicePlan!=='undefined'?slicePlan:null;
  const nombreCortes=paratiroidesReconoceNombre($('sliceName').value,estado.caso,f);
  // Los cortes quedan hechos aunque despues se cambie al MIP para el PNG: se recuerda la
  // primera vez que se ven generados con los parametros pedidos, o cuando ya se exportaron.
  const cortesVivo=fusionOk&&!!plan&&plan.plane===cortes.plano&&Math.abs(plan.distance-cortes.distanciaMm)<1e-6&&Math.abs(plan.thickness-cortes.grosorMm)<1e-6&&$('sliceContent').value==='fusion'&&mode==='slices'&&nombreCortes;
  if(cortesVivo&&!hechos.cortes){hechos.cortes=true;guardar();}
  const cortesOk=spOk&&(cortesVivo||!!hechos.cortes||!!hechos.exportado);
  const lista=[
   {id:'ct',titulo:`Abrir el CT ${nombreFase(f)}`,hecho:ctOk,resaltar:['files'],
    texto:`«Abrir CT» y, dentro de la carpeta del CT ${nombreFase(f)} del caso ${estado.caso}, marcar todos los archivos con Ctrl+A: ${d.ct.cortes} cortes de ${d.ct.espesorMm} mm cada ${d.ct.dzMm} mm, píxel ${d.ct.pixelMm} mm. Luego elige la serie.`,
    problema:volume&&volume.modality==='CT'&&!ctOk?(ctOtra?`Ese es el CT de la fase ${nombreFase(otraFase(f))}. El SPECT ${nombreFase(f)} solo comparte marco de referencia con el CT ${nombreFase(f)}.`:`Ese CT no pertenece al caso ${estado.caso}.`):null},
   {id:'spect',titulo:d.nm.reconstruidaPorEquipo?`Abrir la reconstrucción del equipo (fase ${nombreFase(f)})`:`Abrir tu SPECT «${nombre}»`,hecho:spOk,resaltar:['spectFiles'],
    texto:d.nm.reconstruidaPorEquipo
     ?'«Abrir SPECT» con el archivo de la carpeta «reconstruccion siemens tardio». Es la OSEM con corrección de atenuación del propio Symbia. Fíjate en el aviso de orientación: viene con la inclinación real del gantry, y el visor la trata como axial porque el error queda por debajo de un vóxel.'
     :`«Abrir SPECT» con el DICOM que exportaste del simulador para esta fase. El visor lee la descripción de la serie: debe empezar por «${nombre}». Si el nombre no coincide, cargaste otra fase u otro caso.`,
    problema:ctOk&&spect&&!spOk?(!spMarco?(spOtra?`Ese SPECT es de la fase ${nombreFase(otraFase(f))}: no comparte marco con este CT.`:`Ese SPECT no pertenece al caso ${estado.caso}.`):`El SPECT cargado se llama «${spect.description}»; se esperaba «${nombre}». Es el archivo de otra fase o sin el nombre puesto al exportar.`):null},
   {id:'fusion',titulo:'Revisar la fusión en los tres planos',hecho:fusionOk,resaltar:['fusionOpacity','spectLow'],
    texto:`Con el marco compartido, la fusión aparece sola. Ajusta opacidad y umbral hasta que la emisión se lea sobre la anatomía y recorre axial, coronal y sagital. ${caso().particularidades[caso().particularidades.length>1?1:0]}`},
   {id:'cortes',titulo:`Generar cortes axiales fusionados de ${cortes.grosorMm} mm cada ${cortes.distanciaMm} mm, con el nombre «${nombre}»`,hecho:cortesOk,resaltar:['sliceGenerate','sliceName'],
    texto:`En «Generar cortes»: ventana de trabajo coronal o sagital, plano de salida Axial, ${cortes.distanciaMm} mm de distancia y ${cortes.grosorMm} mm de grosor, contenido «CT + SPECT fusionados», nombre «${nombre}», rango completo, y «Generar». El cuarto panel pasa a mostrar la pila; recórrela con la rueda.`,
    accion:{etiqueta:'Rellenar los parámetros',fn:()=>prepararCortes(f)}},
   {id:'exportar',titulo:'Exportar la serie de cortes como DICOM',hecho:!!hechos.exportado,resaltar:['sliceExport'],
    texto:'«Exportar DICOM» y elegir una carpeta. Se escribe una serie Secondary Capture en color, un archivo por corte, dentro de una carpeta con el nombre de la serie. Es el producto que se revisa en MicroDicom o en cualquier visor.'},
   {id:'png',titulo:'Guardar el PNG del MIP fusionado',hecho:!!hechos.png,resaltar:['exportPng','volumeSource'],
    texto:'En «Reconstrucción 3D», Volumen 3D = «CT + SPECT fusionados», pestaña MIP, gira el volumen hasta una vista anterior clara y pulsa «PNG» en la cabecera del cuarto panel. Es una captura del panel, no un DICOM.'}
  ];
  // Una fase terminada queda terminada: abrir el CT de la otra fase retira este par de la
  // memoria y las comprobaciones en vivo dejarian de cumplirse.
  if(lista.every(p=>p.hecho)){hechos.completa=true;guardar();}
  else if(hechos.completa&&!ctOk)for(const p of lista)p.hecho=true;
  return lista;
 }
 function prepararCortes(f){
  if(!volume)return status('Carga primero el CT y el SPECT de esta fase.',true);
  const disparar=(id,tipo)=>$(id).dispatchEvent(new Event(tipo,{bubbles:true}));
  if($('sliceSource').value===cortes.plano){$('sliceSource').value='coronal';disparar('sliceSource','change');}
  $('slicePlane').value=cortes.plano;disparar('slicePlane','change');
  $('sliceDistance').value=cortes.distanciaMm;$('sliceThickness').value=cortes.grosorMm;
  $('sliceName').value=paratiroidesNombre(estado.caso,f);disparar('sliceName','input');
  if(fusionSample){$('sliceContent').value='fusion';disparar('sliceContent','change');}
  $('sliceFull').click();
  status(`Parámetros listos: axial, ${cortes.distanciaMm}/${cortes.grosorMm} mm, fusionados, «${paratiroidesNombre(estado.caso,f)}». Pulsa «Generar».`);
 }

 // --- Eventos del visor que dejan constancia (sticky) ------------------------------------
 document.addEventListener('volumina',ev=>{
  const d=ev.detail||{};
  if(estado.caso&&d.kind==='exported'&&d.plane===cortes.plano&&d.fusion&&paratiroidesReconoceNombre(d.name,estado.caso,estado.fase)&&Math.abs(d.distance-cortes.distanciaMm)<1e-6&&Math.abs(d.thickness-cortes.grosorMm)<1e-6){estado.hechos[estado.fase].exportado={count:d.count,description:d.description};guardar();}
  if(estado.caso&&d.kind==='png'&&d.mode==='mip'&&d.source==='fusion'&&pasos(estado.fase).slice(0,3).every(p=>p.hecho)){estado.hechos[estado.fase].png=d.name;guardar();}
  refrescar();
 });

 // --- Resaltado --------------------------------------------------------------------------
 let resaltados=[];
 function resaltar(ids){
  for(const el of resaltados)el.classList.remove('tutorial-resaltado');
  resaltados=[];
  for(const id of ids){const control=$(id);if(!control)continue;const objetivo=control.type==='file'?control.closest('label')||control:control.type==='range'?control.closest('label')||control:control;objetivo.classList.add('tutorial-resaltado');resaltados.push(objetivo);}
 }

 // --- Render -----------------------------------------------------------------------------
 const h=(tag,attrs={},...hijos)=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='onclick')el.onclick=v;else if(v!==null&&v!==undefined)el.setAttribute(k,v);}for(const hijo of hijos)if(hijo!=null)el.append(hijo);return el;};
 function render(){
  panel.replaceChildren();
  if(!estado.caso){renderEleccion();resaltar([]);return;}
  const c=caso();
  panel.append(h('div',{class:'tutorial-cabecera'},h('b',{},`PARATIROIDES · CASO ${estado.caso} · 2.ª PARTE`),h('span',{},h('button',{type:'button',class:'tutorial-mini',onclick:()=>{estado.plegado=!estado.plegado;render();}},estado.plegado?'Mostrar':'Plegar'),h('button',{type:'button',class:'tutorial-mini',onclick:()=>{estado.caso=null;estado.hechos={precoz:{},tardio:{}};estado.fase='precoz';guardar();render();}},'Cambiar'))));
  if(estado.plegado){resaltar([]);return;}
  panel.append(h('p',{class:'tutorial-titulo'},c.titulo));
  const part=h('details',{},h('summary',{},'Particularidades y qué buscar'));const ul=h('ul',{});for(const p of c.particularidades)ul.append(h('li',{},p));part.append(ul,h('p',{},c.clinica.hallazgos));panel.append(part);
  const pest=h('div',{class:'tutorial-fases'});
  for(const f of PARATIROIDES_FASES){const completa=pasos(f).every(p=>p.hecho);pest.append(h('button',{type:'button','aria-pressed':String(estado.fase===f),onclick:()=>{estado.fase=f;guardar();render();}},`${completa?'☑':'☐'} ${nombreFase(f)}`));}
  panel.append(pest);
  const lista=pasos(estado.fase),actual=lista.find(p=>!p.hecho);
  const ol=h('ol',{class:'tutorial-pasos'});
  for(const p of lista){
   const li=h('li',{class:p.hecho?'hecho':p===actual?'actual':''},h('span',{class:'marca'},p.hecho?'☑':'☐'),' ',p.titulo);
   if(p===actual){li.append(h('p',{},p.texto));if(p.problema)li.append(h('p',{class:'tutorial-problema'},p.problema));if(p.accion)li.append(h('button',{type:'button',class:'tutorial-accion',onclick:p.accion.fn},p.accion.etiqueta));}
   ol.append(li);
  }
  panel.append(ol);
  resaltar(actual?actual.resaltar||[]:[]);
  const completas=PARATIROIDES_FASES.filter(f=>pasos(f).every(p=>p.hecho));
  if(!actual&&completas.length<PARATIROIDES_FASES.length){
   const siguiente=PARATIROIDES_FASES.find(f=>!completas.includes(f));
   panel.append(h('div',{class:'tutorial-cierre'},h('p',{},`Fase ${nombreFase(estado.fase)} completa.`),h('button',{type:'button',onclick:()=>{estado.fase=siguiente;guardar();render();}},`Pasar a la fase ${nombreFase(siguiente)}`),h('p',{},'Al abrir el otro CT el visor retira el SPECT anterior: es lo esperado, cada fase tiene su propio par.')));
  }
  if(completas.length===PARATIROIDES_FASES.length){
   const cierre=h('div',{class:'tutorial-cierre'},h('b',{},'Caso completo'),h('p',{},'Productos: dos DICOM SPECT reconstruidos, dos series de cortes axiales fusionados y dos PNG del MIP. Ahora sí, compara lo que viste con el informe:'));
   const imp=h('details',{},h('summary',{},'Impresión diagnóstica del informe'),h('p',{},c.clinica.impresion));
   cierre.append(imp,h('p',{},'Para discutir: ¿en qué fase se ve mejor el foco y por qué? ¿Qué aporta el CT de esta calidad a la localización? ¿Qué cambiaría en tu informe si solo tuvieras la planar?'));
   if(estado.caso===5)cierre.append(h('p',{},'Y lo propio de este caso: compara tu OSEM del precoz con la reconstrucción del equipo del tardío. ¿Qué diferencias son del paciente y cuáles del procesamiento?'));
   panel.append(cierre);
  }
 }
 function renderEleccion(){
  panel.append(h('div',{class:'tutorial-cabecera'},h('b',{},'TUTORIAL PARATIROIDES · 2.ª PARTE')),h('p',{},'¿Qué caso traes del simulador?'));
  const lista=h('div',{class:'tutorial-casos'});
  for(const [n,c] of Object.entries(PARATIROIDES_CASOS))lista.append(h('button',{type:'button',title:c.titulo,onclick:()=>{estado.caso=Number(n);estado.fase='precoz';estado.hechos={precoz:{},tardio:{}};guardar();render();}},`Caso ${n}`));
  panel.append(lista,h('p',{class:'tutorial-nota'},'Si vienes con el enlace del simulador, el caso ya viene elegido. Sin caso elegido, el visor funciona igual que siempre.'));
 }

 // --- Arranque ---------------------------------------------------------------------------
 recuperar();
 const url=new URLSearchParams(location.search).get('caso');
 if(url&&PARATIROIDES_CASOS[Number(url)]){if(Number(url)!==estado.caso){estado.hechos={precoz:{},tardio:{}};estado.fase='precoz';}estado.caso=Number(url);guardar();}
 let temporizador=null;const refrescar=()=>{clearTimeout(temporizador);temporizador=setTimeout(render,60);};
 document.addEventListener('change',refrescar,true);document.addEventListener('input',ev=>{if(ev.target.closest&&ev.target.closest('aside'))refrescar();},true);
 render();
})();
