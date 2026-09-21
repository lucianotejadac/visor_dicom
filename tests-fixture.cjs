// Generador de CT axiales sintéticos compartido por las pruebas de recorte y anonimizado.
// Necesita globalThis.dicomParser cargado por quien lo use.
/* Construye un CT axial sintético con toda la basura identificatoria que aparece en un
   estudio real: identidad, fechas, secuencias con UID ajenos, tags privados y overlays. */
function dicom(o={}){
 const {syntax='1.2.840.10008.1.2.1',z=0,instance=1,name='ROSAS DIAZ^MARIA',id='12457618-0',
  values=[-100,0,100,1000],burned=null,extra=[],skip=[]}=o;
 const be=syntax==='1.2.840.10008.1.2.2',implicit=syntax==='1.2.840.10008.1.2';
 const encode=(g,e,vr,value,meta=false)=>{
  const big=meta?false:be,imp=meta?false:implicit;
  let body=Buffer.isBuffer(value)?value:null;
  if(!body&&vr==='US'){body=Buffer.alloc(2);big?body.writeUInt16BE(value):body.writeUInt16LE(value);}
  if(!body){body=Buffer.from(String(value),'latin1');if(body.length%2)body=Buffer.concat([body,Buffer.from(vr==='UI'?'\0':' ','latin1')]);}
  const long=['OB','OW','SQ','UN','UT'].includes(vr),header=Buffer.alloc(imp?8:long?12:8);
  const w16=(v,at)=>big?header.writeUInt16BE(v,at):header.writeUInt16LE(v,at);
  const w32=(v,at)=>big?header.writeUInt32BE(v,at):header.writeUInt32LE(v,at);
  w16(g,0);w16(e,2);
  if(imp)w32(body.length,4);else{header.write(vr,4,'latin1');if(long)w32(body.length,8);else w16(body.length,6);}
  return Buffer.concat([header,body]);
 };
 const item=content=>{
  const header=Buffer.alloc(8);
  if(be){header.writeUInt16BE(0xfffe,0);header.writeUInt16BE(0xe000,2);header.writeUInt32BE(content.length,4);}
  else{header.writeUInt16LE(0xfffe,0);header.writeUInt16LE(0xe000,2);header.writeUInt32LE(content.length,4);}
  return Buffer.concat([header,content]);
 };
 const pixels=Buffer.alloc(values.length*2);
 values.forEach((v,i)=>{const raw=v<0?v+65536:v;be?pixels.writeUInt16BE(raw,i*2):pixels.writeUInt16LE(raw,i*2);});
 const referenced=item(Buffer.concat([
  encode(0x0008,0x1150,'UI','1.2.840.10008.5.1.4.1.1.2'),
  encode(0x0008,0x1155,'UI','1.3.51.0.1.1.192.168.10.228.1034717.1034691')]));
 const anatomic=item(Buffer.concat([
  encode(0x0008,0x0100,'SH','T-D4000'),encode(0x0008,0x0102,'SH','SRT'),
  encode(0x0008,0x0104,'LO','Abdomen')]));
 let rows=[
  [0x0008,0x0005,'CS','ISO_IR 100'],[0x0008,0x0008,'CS','ORIGINAL\\PRIMARY\\AXIAL'],
  [0x0008,0x0012,'DA','20260916'],[0x0008,0x0013,'TM','123216.000000'],
  [0x0008,0x0014,'UI','1.3.12.2.1107.5.1.4.99'],
  [0x0008,0x0016,'UI','1.2.840.10008.5.1.4.1.1.2'],
  [0x0008,0x0018,'UI','1.3.12.2.1107.5.1.4.10001.3000002'],
  [0x0008,0x0020,'DA','20260916'],[0x0008,0x0030,'TM','123216.000000'],
  [0x0008,0x0023,'DA','20260916'],[0x0008,0x0033,'TM','123216.000000'],
  [0x0008,0x0050,'SH','ACC12345'],[0x0008,0x0060,'CS','CT'],
  [0x0008,0x0070,'LO','SIEMENS'],[0x0008,0x0080,'LO','HOSPITAL CENTRAL'],
  [0x0008,0x0090,'PN','DIAZ^ROBERTO'],[0x0008,0x1010,'SH','CT10001'],
  [0x0008,0x1030,'LO','PET CT FDG ONCOLOGICO'],[0x0008,0x103e,'LO','CT WB  3.0  HD_FoV'],
  [0x0008,0x1070,'PN','TECNOLOGO^ANA'],
  [0x0008,0x1110,'SQ',referenced],[0x0008,0x2218,'SQ',anatomic],
  [0x0010,0x0010,'PN',name],[0x0010,0x0020,'LO',id],[0x0010,0x0021,'LO','HOSPITAL CENTRAL'],
  [0x0010,0x0030,'DA','19600214'],[0x0010,0x0040,'CS','F'],[0x0010,0x1010,'AS','066Y'],
  [0x0010,0x1030,'DS','68'],[0x0012,0x0010,'LO','ENSAYO ONCO-4'],
  [0x0018,0x0050,'DS','3'],[0x0018,0x0060,'DS','120'],[0x0018,0x1000,'LO','SN-77421'],
  [0x0018,0x1030,'LO','PETCT_FDG_WB'],
  [0x0020,0x000d,'UI','1.3.51.0.1.1.192.168.10.228.1034717.1034691'],
  [0x0020,0x000e,'UI','1.3.12.2.1107.5.1.4.10001.3000002156'],
  [0x0020,0x0010,'SH','ESTUDIO-7'],[0x0020,0x0011,'IS','2'],[0x0020,0x0013,'IS',String(instance)],
  [0x0020,0x0032,'DS',`-389.2\\-592.2\\${z}`],[0x0020,0x0037,'DS','1\\0\\0\\0\\1\\0'],
  [0x0020,0x0052,'UI','1.3.12.2.1107.5.1.4.10001.3000005'],
  [0x0020,0x4000,'LT','Paciente colabora poco'],
  [0x0028,0x0002,'US',1],[0x0028,0x0004,'CS','MONOCHROME2'],
  [0x0028,0x0010,'US',2],[0x0028,0x0011,'US',2],[0x0028,0x0030,'DS','0.7\\0.7'],
  [0x0028,0x0100,'US',16],[0x0028,0x0101,'US',16],[0x0028,0x0102,'US',15],[0x0028,0x0103,'US',1],
  [0x0028,0x1052,'DS','-10240'],[0x0028,0x1053,'DS','10'],
  [0x0029,0x0010,'LO','SIEMENS CSA HEADER'],[0x0029,0x1140,'LO','1.3.12.2.1107.5.1.4.99.1'],
  [0x6000,0x0010,'US',2],[0x6000,0x0011,'US',2],
  [0x7fe0,0x0010,'OW',pixels]];
 if(burned)rows.push([0x0028,0x0301,'CS',burned]);
 rows=rows.filter(r=>!skip.includes(`x${r[0].toString(16).padStart(4,'0')}${r[1].toString(16).padStart(4,'0')}`)).concat(extra);
 rows.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const meta=Buffer.concat([
  encode(0x0002,0x0002,'UI','1.2.840.10008.5.1.4.1.1.2',true),
  encode(0x0002,0x0003,'UI','1.3.12.2.1107.5.1.4.10001.3000002',true),
  encode(0x0002,0x0010,'UI',syntax,true)]);
 return new Uint8Array(Buffer.concat([Buffer.alloc(128),Buffer.from('DICM'),
  encode(0x0002,0x0000,'UL',(()=>{const b=Buffer.alloc(4);b.writeUInt32LE(meta.length);return b;})(),true),
  meta,...rows.map(r=>encode(...r))]));
}
module.exports={dicom};
