// Único generador de datos y PDF para descarga, envío individual y lotes.
const PDFDocument = require("pdfkit");
const db = require("../database/db");
const { AppError } = require("../utils/errors");
const { inspectMedia } = require("../whatsapp/media.cjs");
const BRAND="#b72107", INK="#0f172a", MUTED="#475569", PALE="#f1f5f9";
function dateText(s) {
  const value=String(s || "");
  if (/^\d{4}-\d{2}-\d{2}_/.test(value)) return dateText(value.slice(0,10))+" al "+dateText(value.slice(11));
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(8)+"/"+value.slice(5,7)+"/"+value.slice(0,4) : value;
}
function weekOf(value) {
  const date=String(value||"").slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const d=new Date(date+"T12:00:00.000Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate()-(d.getUTCDay()===6?0:d.getUTCDay()+1));
  const first=d.toISOString().slice(0,10);
  d.setUTCDate(d.getUTCDate()+6);
  return first+"_"+d.toISOString().slice(0,10);
}
function weekValue(value) {
  if (!value||value==="TODAS") return "TODAS";
  if (typeof value!=="string"||! /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(value)||weekOf(value.slice(0,10))!==value)
    throw new AppError("Selecciona una semana válida.");
  return value;
}
function load(code, week="TODAS") {
  const selectedWeek=weekValue(week);
  const codigo=String(code||"").trim().toUpperCase();
  const user=db.prepare("SELECT codigo,nombre,apellido,ciclo,turno FROM usuarios WHERE codigo=? AND rol='estudiante'").get(codigo);
  if(!user) throw new AppError("Estudiante no encontrado.",404);
  const exams=db.prepare(
    "SELECT e.titulo,e.fecha,e.tipo,r.area,r.correctas,r.incorrectas,r.enBlanco,r.puntajeTotal,r.posicion FROM respuestas_evaluacion r JOIN evaluaciones e ON r.evaluacion_id=e.id WHERE r.codigoEstudiante=? ORDER BY e.creado_en DESC"
  ).all(codigo);
  const cycle=String(user.ciclo||"").trim().toUpperCase();
  const tasks=db.prepare(
    "SELECT t.curso,t.ciclo,t.fecha,t.tipoEvaluacion,r.nota,CASE WHEN r.id IS NOT NULL THEN COALESCE(r.estado,'EVALUADO') ELSE 'NO PRESENTÓ' END AS estado FROM tareas t LEFT JOIN registros_tarea r ON r.tarea_id=t.id AND UPPER(r.codigoEstudiante)=? WHERE (UPPER(t.ciclo)=? AND ? <> '') OR r.id IS NOT NULL GROUP BY t.id ORDER BY t.fecha DESC,t.creado_en DESC"
  ).all(codigo,cycle,cycle);
  const evaluations=selectedWeek==="TODAS"?exams:exams.filter(row=>weekOf(row.fecha)===selectedWeek);
  const homework=selectedWeek==="TODAS"?tasks:tasks.filter(row=>weekOf(row.fecha)===selectedWeek);
  if(evaluations.length+homework.length>800) throw new AppError("Selecciona una semana para reducir el tamaño del reporte.");
  const dates=[...evaluations.map(r=>r.fecha),...homework.flatMap(r=>String(r.fecha||"").split("_"))].filter(s=>/^\d{4}-\d{2}-\d{2}/.test(String(s))).sort();
  const period=selectedWeek==="TODAS"
    ? dates.length?(dates[0]===dates.at(-1)?"Al "+dateText(dates[0]):"Del "+dateText(dates[0])+" al "+dateText(dates.at(-1))):"Sin registros acumulados"
    : "Semana: "+dateText(selectedWeek);
  return {
    estudiante:{codigo:user.codigo,nombre:[user.apellido,user.nombre].filter(Boolean).join(" "),ciclo:user.ciclo||"N/A",turno:user.turno||"N/A"},
    evaluaciones:evaluations,tareas:homework,period,week:selectedWeek,
  };
}
function taskGrade(row) {
  if(String(row.tipoEvaluacion||"").toLowerCase()==="binario"){
    return /^(PRESENTÓ|PRESENTO|ENTREGÓ|ENTREGO|ENTREGADO|SI)$/.test(String(row.estado||"").toUpperCase())?"PRESENTÓ":"NO PRESENTÓ";
  }
  if(row.nota!==null && row.nota!==undefined && !Number.isNaN(Number(row.nota))) return "NOTA: "+row.nota+" / 20";
  return String(row.estado||"NO PRESENTÓ");
}
async function render(data) {
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:"A4",margin:40,bufferPages:true,compress:false,
      info:{Title:"Ficha académica INGEMAT - "+data.estudiante.codigo,
      Author:"Academia Preuniversitaria INGEMAT",CreationDate:new Date(0)}});
    const chunks=[];
    doc.on("data",chunk=>chunks.push(chunk));
    doc.on("error",reject);
    doc.on("end",()=>{try{const buffer=Buffer.concat(chunks);inspectMedia(buffer,"pdf");resolve(buffer);}catch(e){reject(e);}});
    const x=40,total=515,bottom=760;
    const write=(t,tx,ty,w,size=9,color=INK,bold=false,height=25)=>{
      doc.font(bold?"Helvetica-Bold":"Helvetica").fontSize(size).fillColor(color)
        .text(String(t??"—"),tx,ty,{width:w,height,ellipsis:true});
    };
    let y=44;
    doc.rect(x,36,total,4).fill(BRAND);
    write("ACADEMIA PREUNIVERSITARIA INGEMAT",x,48,total-160,17,BRAND,true,26);
    write("REPORTE ACADÉMICO",x+360,53,155,11,INK,true);
    write("Sistema de Evaluación Integral y Reporte de Desempeño",x,76,total,9,MUTED);
    doc.roundedRect(x,100,total,94,7).fill(PALE);
    write(data.estudiante.nombre,x+12,110,total-24,15,INK,true);
    write("Código: "+data.estudiante.codigo+"  |  Ciclo: "+data.estudiante.ciclo+"  |  Turno: "+data.estudiante.turno,x+12,136,total-24,9,MUTED);
    write("Periodo evaluado: "+data.period,x+12,158,total-24,9,BRAND,true);
    y=218;
    doc.roundedRect(x,y,160,48,5).strokeColor("#cbd5e1").stroke();
    doc.roundedRect(x+177,y,160,48,5).stroke();
    doc.roundedRect(x+354,y,161,48,5).stroke();
    write(String(data.evaluaciones.length),x+8,y+6,145,17,BRAND,true);
    write("Exámenes rendidos",x+8,y+29,146,8,MUTED);
    write(String(data.tareas.length),x+185,y+6,144,17,BRAND,true);
    write("Tareas registradas",x+185,y+29,144,8,MUTED);
    write(data.week==="TODAS"?"Consolidado":"Semanal",x+362,y+9,145,12,BRAND,true);
    write("Tipo de ficha",x+362,y+29,144,8,MUTED);
    y=284;
    function header(title){
      if(y>bottom-65){doc.addPage();y=48;}
      doc.rect(x,y,4,19).fill(BRAND);
      write(title,x+12,y+2,total-12,12,INK,true,20);
      y+=28;
    }
    function table(title,cols,rows){
      header(title);
      function titles(){
        doc.rect(x,y,total,26).fill(PALE);
        let xpos=x;
        for(const [label,w] of cols){write(label,xpos+4,y+7,w-8,7,INK,true,18);xpos+=w;}
        y+=28;
      }
      titles();
      if(!rows.length){write("Sin registros en el periodo seleccionado.",x+8,y+9,total-16,9,MUTED);y+=34;return;}
      for(let i=0;i<rows.length;i++){
        const row=rows[i],height=39;
        if(y+height>bottom){doc.addPage();y=48;titles();}
        if(i%2===0)doc.rect(x,y,total,height).fill("#fbfcff");
        let xpos=x;
        row.forEach((value,j)=>{
          const w=cols[j][1];
          write(value,xpos+4,y+5,w-8,j===0?8.3:8,INK,j===0,height-10);
          xpos+=w;
        });
        doc.moveTo(x,y+height).lineTo(x+total,y+height).lineWidth(.4).strokeColor("#e2e8f0").stroke();
        y+=height;
      }
      y+=19;
    }
    table("Historial de evaluaciones y simulacros",
      [["Examen",162],["Fecha",65],["Correctas",49],["Incorrectas",58],["Blanco",43],["Puntaje",79],["Puesto",59]],
      data.evaluaciones.map(e=>[
        e.titulo,dateText(e.fecha),
        e.tipo==="test"?"—":e.correctas,e.tipo==="test"?"—":e.incorrectas,e.tipo==="test"?"—":e.enBlanco,
        String(e.puntajeTotal??"—")+" pts","#"+String(e.posicion??"—")
      ]));
    table("Historial de tareas por curso",
      [["Curso / asignatura",174],["Fecha",98],["Ciclo",91],["Calificación / estado",152]],
      data.tareas.map(t=>[t.curso,dateText(t.fecha),t.ciclo,taskGrade(t)]));
    if(y+72>bottom){doc.addPage();y=48;}
    doc.roundedRect(x,y,total,65,7).fill(PALE);
    write("AGRADECIMIENTO POR SU CONFIANZA",x+12,y+9,total-24,10,BRAND,true);
    write("Agradecemos al padre de familia o apoderado de "+data.estudiante.nombre+
      " su confianza en INGEMAT. Reafirmamos nuestro compromiso con la formación académica.",x+12,y+28,total-24,8.5,INK,false,31);
    const pages=doc.bufferedPageRange();
    for(let i=pages.start;i<pages.start+pages.count;i++){
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8).fillColor(MUTED)
        .text("INGEMAT · Página "+(i+1)+" de "+pages.count,x,798,{width:total,align:"right"});
    }
    doc.end();
  });
}
async function generate(code,week="TODAS"){return render(load(code,week));}
module.exports={load,generate,render,weekValue};
