/* Writes Secondary Capture RGB DICOM Part 10 files (Explicit VR Little Endian) and a
   store-only ZIP. Derived colour images: no rescale, no HU, not for measurement. */
(function(root){
'use strict';
const SC_CLASS='1.2.840.10008.5.1.4.1.1.7',SYNTAX='1.2.840.10008.1.2.1';
const IMPLEMENTATION='2.25.269471321149657141056372201054218977939';
const LONG=['OB','OW','OF','SQ','UT','UN'];
const encoder=new root.TextEncoder();
// UUID-derived UID root 2.25 needs no registered organisation prefix (PS3.5 B.2).
function uid(){
 const bytes=new Uint8Array(16);root.crypto.getRandomValues(bytes);
 let value=0n;for(const b of bytes)value=(value<<8n)|BigInt(b);
 return '2.25.'+value.toString();
}
function ds(value){
 const n=Number(value);if(!Number.isFinite(n))return '0';
 let text=n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
 if(text==='-0')text='0';
 return text.length>16?n.toPrecision(9).slice(0,16):text;
}
const pad2=n=>String(n).padStart(2,'0');
function dicomDate(date){return `${date.getFullYear()}${pad2(date.getMonth()+1)}${pad2(date.getDate())}`;}
function dicomTime(date){return `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;}
function element(group,number,vr,value){
 let body;
 if(value instanceof Uint8Array)body=value;
 else if(vr==='US'||vr==='UL'){body=new Uint8Array(vr==='US'?2:4);const view=new DataView(body.buffer);if(vr==='US')view.setUint16(0,value,true);else view.setUint32(0,value,true);}
 else body=encoder.encode(String(value));
 if(body.length%2){const padded=new Uint8Array(body.length+1);padded.set(body);padded[body.length]=vr==='UI'||vr==='OB'?0:32;body=padded;}
 const long=LONG.includes(vr),header=new Uint8Array(long?12:8),view=new DataView(header.buffer);
 view.setUint16(0,group,true);view.setUint16(2,number,true);
 header[4]=vr.charCodeAt(0);header[5]=vr.charCodeAt(1);
 if(long)view.setUint32(8,body.length,true);else view.setUint16(6,body.length,true);
 const out=new Uint8Array(header.length+body.length);out.set(header);out.set(body,header.length);
 return out;
}
function concat(parts){
 let total=0;for(const p of parts)total+=p.length;
 const out=new Uint8Array(total);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}
 return out;
}
function dataset(rows){
 return concat(rows.filter(Boolean).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(r=>element(r[0],r[1],r[2],r[3])));
}
/* One reformatted colour slice. Geometry (position, orientation, spacing) is written even
   though the Image Plane module is optional for Secondary Capture: without it the series
   cannot be located in the patient. */
function secondaryCapture(o){
 const rgb=o.rgb,columns=o.columns,rows=o.rows;
 if(!(rgb instanceof Uint8Array)||rgb.length!==columns*rows*3)throw Error('Píxeles RGB incompletos para el corte');
 if(!columns||!rows||columns>65535||rows>65535)throw Error('Dimensiones de corte no válidas');
 const now=o.now||new Date(),date=dicomDate(now),time=dicomTime(now);
 const sopUid=o.sopUid||uid();
 const body=dataset([
  [0x0008,0x0005,'CS','ISO_IR 192'],
  [0x0008,0x0008,'CS',o.imageType||'DERIVED\\SECONDARY\\REFORMATTED'],
  [0x0008,0x0012,'DA',date],[0x0008,0x0013,'TM',time],
  [0x0008,0x0016,'UI',SC_CLASS],[0x0008,0x0018,'UI',sopUid],
  [0x0008,0x0020,'DA',o.studyDate||''],[0x0008,0x0021,'DA',date],[0x0008,0x0023,'DA',date],
  [0x0008,0x0030,'TM',o.studyTime||''],[0x0008,0x0031,'TM',time],[0x0008,0x0033,'TM',time],
  [0x0008,0x0050,'SH',o.accession||''],
  [0x0008,0x0060,'CS','OT'],[0x0008,0x0064,'CS','WSD'],
  [0x0008,0x0070,'LO','Volumina'],[0x0008,0x0090,'PN',o.referring||''],
  [0x0008,0x103e,'LO',o.seriesDescription||'Reformateo Volumina'],
  [0x0008,0x2111,'ST',o.derivation||''],
  [0x0010,0x0010,'PN',o.patientName||''],[0x0010,0x0020,'LO',o.patientId||''],
  o.issuer?[0x0010,0x0021,'LO',o.issuer]:null,
  [0x0018,0x0050,'DS',ds(o.sliceThickness)],[0x0018,0x0088,'DS',ds(o.spacingBetweenSlices)],
  [0x0018,0x1020,'LO','Volumina prototipo'],
  [0x0020,0x000d,'UI',o.studyUid],[0x0020,0x000e,'UI',o.seriesUid],
  [0x0020,0x0010,'SH',o.studyId||''],[0x0020,0x0011,'IS',String(o.seriesNumber)],[0x0020,0x0013,'IS',String(o.instanceNumber)],
  [0x0020,0x0032,'DS',o.position.map(ds).join('\\')],[0x0020,0x0037,'DS',o.orientation.map(ds).join('\\')],
  o.frameUid?[0x0020,0x0052,'UI',o.frameUid]:null,
  [0x0020,0x1041,'DS',ds(o.sliceLocation)],
  [0x0028,0x0002,'US',3],[0x0028,0x0004,'CS','RGB'],[0x0028,0x0006,'US',0],
  [0x0028,0x0010,'US',rows],[0x0028,0x0011,'US',columns],
  [0x0028,0x0030,'DS',[ds(o.pixelSpacing[0]),ds(o.pixelSpacing[1])].join('\\')],
  [0x0028,0x0100,'US',8],[0x0028,0x0101,'US',8],[0x0028,0x0102,'US',7],[0x0028,0x0103,'US',0],
  [0x0028,0x0301,'CS','NO'],[0x0028,0x2110,'CS','00'],
  [0x7fe0,0x0010,'OB',rgb]
 ]);
 const metaBody=concat([
  element(0x0002,0x0001,'OB',Uint8Array.from([0,1])),
  element(0x0002,0x0002,'UI',SC_CLASS),element(0x0002,0x0003,'UI',sopUid),
  element(0x0002,0x0010,'UI',SYNTAX),element(0x0002,0x0012,'UI',IMPLEMENTATION),
  element(0x0002,0x0013,'SH','VOLUMINA')
 ]);
 const preamble=new Uint8Array(132);preamble.set(encoder.encode('DICM'),128);
 return concat([preamble,element(0x0002,0x0000,'UL',metaBody.length),metaBody,body]);
}
const CRC=(()=>{const table=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[i]=c>>>0;}return table;})();
function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=CRC[(c^bytes[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
/* Store-only ZIP (no compression): DICOM pixel data is already dense and this keeps the
   writer dependency-free. */
function zip(entries){
 const parts=[],central=[];let offset=0;
 for(const entry of entries){
  const name=encoder.encode(entry.name),data=entry.data,sum=crc32(data);
  const local=new Uint8Array(30+name.length),view=new DataView(local.buffer);
  view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x0800,true);
  view.setUint32(14,sum,true);view.setUint32(18,data.length,true);view.setUint32(22,data.length,true);
  view.setUint16(26,name.length,true);local.set(name,30);
  const record=new Uint8Array(46+name.length),rview=new DataView(record.buffer);
  rview.setUint32(0,0x02014b50,true);rview.setUint16(4,20,true);rview.setUint16(6,20,true);rview.setUint16(8,0x0800,true);
  rview.setUint32(16,sum,true);rview.setUint32(20,data.length,true);rview.setUint32(24,data.length,true);
  rview.setUint16(28,name.length,true);rview.setUint32(42,offset,true);record.set(name,46);
  parts.push(local,data);central.push(record);
  offset+=local.length+data.length;
 }
 const directory=concat(central),end=new Uint8Array(22),view=new DataView(end.buffer);
 view.setUint32(0,0x06054b50,true);view.setUint16(8,entries.length,true);view.setUint16(10,entries.length,true);
 view.setUint32(12,directory.length,true);view.setUint32(16,offset,true);
 return concat([...parts,directory,end]);
}
root.DicomWrite={uid,ds,dicomDate,dicomTime,element,dataset,secondaryCapture,zip,crc32,SC_CLASS,SYNTAX};
})(typeof window!=='undefined'?window:globalThis);
