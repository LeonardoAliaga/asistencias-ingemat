import { showWhatsAppToast } from "./whatsapp-status.js";
const $=id=>document.getElementById(id);
function uuid(){
  if(typeof crypto.randomUUID==="function") return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const h=[...bytes].map(v=>v.toString(16).padStart(2,"0")).join("");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}
async function getJSON(url, options){
  const r=await fetch(url,options);
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.mensaje||"No se pudo consultar el listado.");
  return data;
}
export function setupBulkReports(){
  const root=$("report-bulk-panel");
  if(!root||root.dataset.initialized) return;
  root.dataset.initialized="true";
  const cycle=$("report-bulk-cycle"),period=$("report-bulk-week"),
    list=$("report-bulk-list"),summary=$("report-bulk-summary"),
    message=$("report-bulk-message"),send=$("report-bulk-send");
  let students=[],selection=new Map(),generation=0,attemptId=null;
  const status=text=>{message.textContent=text;};
  function control(text,label){
    const el=document.createElement("button");el.type="button";el.className="button secondary";
    el.textContent=text;el.setAttribute("aria-label",label);return el;
  }
  function field(labelText){
    const span=document.createElement("span");span.textContent=labelText;return span;
  }
  function updateSummary(){
    const selected=[...selection.entries()].filter(([code,id])=>id && students.some(s=>s.codigo===code && s.contacts.some(c=>c.id===id)));
    const withoutConsent=students.filter(s=>!s.contacts.length).length;
    summary.textContent=students.length+" estudiantes · "+selected.length+" seleccionados · "+
      withoutConsent+" sin apoderado autorizado · "+Math.max(0,students.length-selection.size)+" excluidos.";
    send.disabled=!selected.length||selected.length>20;
    if(selected.length>20) status("Hay "+selected.length+" seleccionados. Quita algunos con × hasta dejar como máximo 20 para este lote.");
  }
  function render(){
    list.replaceChildren();
    for(const student of students){
      if(!selection.has(student.codigo)) continue;
      const li=document.createElement("li");li.className="report-bulk-item";
      li.dataset.code=student.codigo;
      const detail=document.createElement("div");detail.className="report-bulk-detail";
      const name=document.createElement("strong");name.textContent=student.nombre;
      const code=field("Código: "+student.codigo+" · "+student.ciclo);
      detail.append(name,code);
      const contactArea=document.createElement("div");
      contactArea.className="report-bulk-contact";
      if(!student.contacts.length){
        contactArea.textContent="Sin apoderado autorizado. No se enviará.";
        contactArea.classList.add("report-bulk-no-consent");
      }else{
        const label=document.createElement("label");
        label.textContent="Apoderado autorizado";
        const select=document.createElement("select");
        select.setAttribute("aria-label","Apoderado de "+student.nombre);
        for(const contact of student.contacts){
          const option=document.createElement("option");
          option.value=contact.id;
          option.textContent=contact.name+" · "+contact.phone;
          select.append(option);
        }
        select.value=selection.get(student.codigo);
        select.addEventListener("change",()=>{
          selection.set(student.codigo,select.value);
          attemptId=null;
          updateSummary();
        });
        label.append(select);contactArea.append(label);
      }
      const remove=control("×","Quitar a "+student.nombre+" del lote");
      remove.classList.add("report-bulk-remove");
      remove.addEventListener("click",()=>{
        selection.delete(student.codigo);attemptId=null;li.remove();updateSummary();
      });
      li.append(detail,contactArea,remove);
      list.append(li);
    }
    updateSummary();
  }
  function freshSelection(){
    selection=new Map(students.map(s=>[s.codigo,s.contacts[0]?.id||null]));
    attemptId=null;status("");render();
  }
  async function loadStudents(){
    const current=++generation;
    students=[];selection.clear();render();status("");
    if(!cycle.value){summary.textContent="Selecciona un ciclo.";return;}
    summary.textContent="Cargando estudiantes y apoderados del ciclo...";
    try{
      const data=await getJSON("/api/v2/whatsapp/batch-students?cycle="+encodeURIComponent(cycle.value));
      if(current!==generation)return;
      students=data.students;
      freshSelection();
    }catch(e){if(current===generation){summary.textContent="No se pudo cargar la lista.";status(e.message);}}
  }
  async function loadCycles(){
    try{
      const data=await getJSON("/api/v2/whatsapp/attendance-groups");
      const cycles=data.cycles.map(s=>s.cycle);
      cycle.replaceChildren(new Option("Selecciona un ciclo",""),...cycles.map(c=>new Option(c,c)));
      if(cycles.length===1){cycle.value=cycles[0];await loadStudents();}
    }catch(e){status(e.message);}
  }
  function populateWeeks(){
    const current=period.value;
    const weeks=[new Option("Todas las semanas registradas","TODAS")];
    let today=new Date();
    for(let index=0;index<12;index++){
      const day=new Date(today);
      const offset=(day.getDay()+1)%7;
      day.setDate(day.getDate()-offset-7*index);
      const start=day.toISOString().slice(0,10);
      day.setDate(day.getDate()+6);
      const end=day.toISOString().slice(0,10);
      weeks.push(new Option("Semana: "+start+" al "+end,start+"_"+end));
    }
    period.replaceChildren(...weeks);
    if([...period.options].some(o=>o.value===current))period.value=current;
  }
  cycle.addEventListener("change",loadStudents);
  $("report-bulk-reload").addEventListener("click",loadStudents);
  $("report-bulk-restore").addEventListener("click",freshSelection);
  period.addEventListener("change",()=>{attemptId=null;status("");});
  send.addEventListener("click",async()=>{
    const items=[...selection].filter(([code,id])=>id && students.some(s=>s.codigo===code&&s.contacts.some(c=>c.id===id)))
      .map(([code,contactId])=>({code,contactId}));
    if(!items.length||items.length>20)return;
    if(!window.confirm("¿Poner "+items.length+" reportes PDF individuales del ciclo "+cycle.value+
      " en cola de WhatsApp? Solo se incluirán los apoderados autorizados que aparecen en la lista. Revisa Comunicación para verificar las entregas.")) return;
    send.disabled=true;status("Generando documentos y preparando la cola...");
    if(!attemptId)attemptId=uuid();
    try{
      const result=await getJSON("/api/v2/whatsapp/batch-student-reports",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({cycle:cycle.value,week:period.value,format:"pdf",requestId:attemptId,items}),
      });
      const text=result.enqueued+" reportes puestos en cola; "+result.duplicate+
        " ya estaban registrados. Consulta Comunicación para ver su estado.";
      status(text);showWhatsAppToast(text,"success");
      // No se registra el lote dos veces por accidente.
      for(const item of items)selection.delete(item.code);
      attemptId=null;render();
    }catch(e){status(e.message);}finally{updateSummary();}
  });
  populateWeeks();
  void window.ingematSession.then(session=>{
    if(session.usuario?.role!=="admin"){root.hidden=true;return;}
    loadCycles();
  });
}
