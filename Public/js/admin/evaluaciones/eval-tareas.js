// Public/js/admin/evaluaciones/eval-tareas.js

import { evalState } from "./eval-state.js";
import { getSemanaSabadoVieInfo } from "./eval-utils.js";

export function populateSemanasTareasForm() {
  const select = document.getElementById("tarea-semana-select");
  if (!select) return;

  const currentInfo = getSemanaSabadoVieInfo(new Date());
  const options = [];

  const now = new Date();
  for (let offset = -8; offset <= 4; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset * 7);
    const info = getSemanaSabadoVieInfo(d);
    if (!options.some((o) => o.value === info.value)) {
      options.push(info);
    }
  }

  options.sort((a, b) => b.sabadoYMD.localeCompare(a.sabadoYMD));

  select.innerHTML = options
    .map(
      (opt) =>
        `<option value="${opt.value}" ${opt.value === currentInfo.value ? "selected" : ""}>${opt.label}${
          opt.value === currentInfo.value ? " ⭐ (Actual)" : ""
        }</option>`
    )
    .join("");
}

export async function cargarSemanasExcelConsolidado(ciclo) {
  const selectSemana = document.getElementById("excel-tareas-semana-select");
  if (!selectSemana) return;

  if (!ciclo) {
    selectSemana.innerHTML = '<option value="">-- Selecciona primero un ciclo --</option>';
    return;
  }

  selectSemana.innerHTML = '<option value="">Cargando semanas registradas...</option>';
  try {
    const res = await fetch(`/api/evaluaciones/tareas/semanas?ciclo=${encodeURIComponent(ciclo)}`);
    const data = await res.json();
    if (data.exito && Array.isArray(data.semanas) && data.semanas.length > 0) {
      selectSemana.innerHTML = data.semanas
        .map((s, idx) => `<option value="${s.key}" ${idx === 0 ? "selected" : ""}>${s.label}</option>`)
        .join("");
    } else {
      const currentInfo = getSemanaSabadoVieInfo(new Date());
      selectSemana.innerHTML = `<option value="${currentInfo.value}">${currentInfo.label} (Sin registros aún)</option>`;
    }
  } catch (err) {
    selectSemana.innerHTML = '<option value="">Error al cargar semanas</option>';
  }
}

// Helper: Obtener Rango de Semana (Sábado a Viernes)
function getSemanaRango(fechaStr) {
  if (!fechaStr) return "Semana Sin Fecha";
  if (fechaStr.includes("_")) {
    const parts = fechaStr.split("_");
    const p1 = (parts[0] || "").split("-");
    const p2 = (parts[1] || "").split("-");
    if (p1.length === 3 && p2.length === 3) {
      return `📅 Semana: Sáb ${p1[2]}/${p1[1]} al Vie ${p2[2]}/${p2[1]}/${p2[0]}`;
    }
  }
  return getSemanaSabadoVieInfo(fechaStr).label;
}

// Helper: Nombre del Día de la Semana
function getDiaNombreFormateado(fechaStr) {
  if (!fechaStr) return "";
  const parts = fechaStr.split("-");
  if (parts.length !== 3) return fechaStr;

  const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const dayIdx = date.getDay();
  const pad = (n) => String(n).padStart(2, "0");
  const fechaFmt = `${dias[dayIdx]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;

  if (dayIdx === 6) {
    return `📌 ${fechaFmt} <span style="background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:4px; font-size:0.75rem; font-weight:700;">☀️ SÁBADO</span>`;
  }
  if (dayIdx === 0) {
    return `📌 ${fechaFmt} <span style="background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:4px; font-size:0.75rem; font-weight:700;">☀️ DOMINGO</span>`;
  }

  return `📌 ${fechaFmt}`;
}

export async function cargarHistorialTareas() {
  const container = document.getElementById("tareas-list-container");
  if (!container) return;

  try {
    const res = await fetch("/api/evaluaciones/tareas/list");
    const data = await res.json();

    if (data.exito && Array.isArray(data.tareas)) {
      const todasLasTareas = [];

      data.tareas.forEach((grupo) => {
        if (grupo.registros && Array.isArray(grupo.registros)) {
          grupo.registros.forEach((reg) => {
            const cod = reg.codigoEstudiante || "";
            const u = evalState.globalUsuarios.find(
              (usr) => (usr.codigo || "").toUpperCase() === cod.toUpperCase()
            );
            const nombreEst =
              reg.nombreEstudiante ||
              (u ? `${u.nombre || ""} ${u.apellido || ""}`.trim() : `Alumno [${cod || "---"}]`);

            todasLasTareas.push({
              registroId: reg.id,
              tareaId: grupo.id,
              curso: grupo.curso,
              ciclo: grupo.ciclo,
              fecha: grupo.fecha,
              codigoEstudiante: cod || "---",
              nombreEstudiante: nombreEst,
              nota: reg.nota !== undefined && reg.nota !== null ? reg.nota : null,
              estado: reg.estado || "EVALUADO",
            });
          });
        }
      });

      if (todasLasTareas.length === 0) {
        container.innerHTML = "<i>No hay tareas registradas aún.</i>";
        return;
      }

      const tareasLimitadas = todasLasTareas.slice(0, 25);
      const tareasPorSemana = {};

      tareasLimitadas.forEach((t) => {
        const semanaKey = getSemanaRango(t.fecha);
        if (!tareasPorSemana[semanaKey]) {
          tareasPorSemana[semanaKey] = {};
        }

        const diaKey = t.fecha;
        if (!tareasPorSemana[semanaKey][diaKey]) {
          tareasPorSemana[semanaKey][diaKey] = [];
        }

        tareasPorSemana[semanaKey][diaKey].push(t);
      });

      let html = `<div style="display:flex; flex-direction:column; gap:16px;">`;

      Object.keys(tareasPorSemana).forEach((semanaLabel) => {
        const diasObj = tareasPorSemana[semanaLabel];
        const diasArray = Object.keys(diasObj).sort().reverse();

        let totalSemanaRegistros = 0;
        diasArray.forEach((d) => (totalSemanaRegistros += diasObj[d].length));

        html += `
          <div class="semana-card-block" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
            <div style="background:#0f172a; color:#ffffff; padding:10px 16px; font-weight:800; font-size:0.92rem; display:flex; justify-content:space-between; align-items:center;">
              <span>${semanaLabel}</span>
              <span style="font-size:0.78rem; background:rgba(255,255,255,0.15); padding:3px 10px; border-radius:12px;">${totalSemanaRegistros} registros</span>
            </div>
            <div style="padding:14px; display:flex; flex-direction:column; gap:14px;">
        `;

        diasArray.forEach((fechaDia) => {
          const registrosDia = diasObj[fechaDia];
          const diaFormateado = getDiaNombreFormateado(fechaDia);

          html += `
            <div class="dia-registros-group" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
              <div style="font-weight:800; color:#b72107; font-size:0.88rem; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
                ${diaFormateado} (${registrosDia.length} registros)
              </div>
              <div style="overflow-x:auto;">
                <table class="three-col-table" style="width:100%; font-size:0.85rem;">
                  <thead>
                    <tr style="background:#f1f5f9;">
                      <th style="width:90px; text-align:center;">Código</th>
                      <th style="text-align:left;">Estudiante</th>
                      <th style="text-align:left;">Curso / Asignatura</th>
                      <th style="width:130px; text-align:center;">Ciclo / Salón</th>
                      <th style="width:110px; text-align:center;">Calificación</th>
                      <th style="width:70px; text-align:center;">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
          `;

          registrosDia.forEach((t) => {
            const calif =
              t.nota !== null
                ? `<b style="color:#166534; font-size:0.9rem;">${t.nota} / 20</b>`
                : `<span style="background:#e2e8f0; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.78rem; color:#475569;">${t.estado}</span>`;

            html += `
              <tr>
                <td style="text-align:center;"><b>${t.codigoEstudiante}</b></td>
                <td style="text-align:left;">${t.nombreEstudiante}</td>
                <td style="text-align:left; font-weight:600; color:#0f172a;">${t.curso}</td>
                <td style="text-align:center;"><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${t.ciclo}</span></td>
                <td style="text-align:center;">${calif}</td>
                <td style="text-align:center;">
                  <button class="btn-delete-registro-tarea" data-id="${t.registroId || ""}" data-nombre="${t.nombreEstudiante}" data-curso="${t.curso}" style="background:#fef2f2; border:1px solid #fca5a5; color:#dc2626; border-radius:4px; padding:3px 7px; cursor:pointer;" title="Eliminar este registro de tarea">
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
              </tr>
            `;
          });

          html += `
                  </tbody>
                </table>
              </div>
            </div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      });

      html += `</div>`;
      container.innerHTML = html;

      container.querySelectorAll(".btn-delete-registro-tarea").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const regId = e.currentTarget.getAttribute("data-id");
          const nombre = e.currentTarget.getAttribute("data-nombre");
          const curso = e.currentTarget.getAttribute("data-curso");

          if (!regId) return;

          if (confirm(`¿Seguro que deseas eliminar el registro de tarea de "${nombre}" en "${curso}"?`)) {
            try {
              const res = await fetch(`/api/evaluaciones/tareas/registro/${regId}`, { method: "DELETE" });
              const resData = await res.json();
              if (resData.exito) {
                await cargarHistorialTareas();
              } else {
                alert(`Error al eliminar: ${resData.mensaje}`);
              }
            } catch (err) {
              alert(`Error de red: ${err.message}`);
            }
          }
        });
      });
    }
  } catch (err) {
    console.error("Error al cargar historial de tareas:", err);
  }
}

// Registro de Tareas por Curso (Con Alternancia Vigesimal / Binario)
export function setupFormTareas() {
  const form = document.getElementById("form-registrar-tareas");
  const tipoEvalSelect = document.getElementById("tarea-tipo-eval-select");
  const groupVigesimal = document.getElementById("group-nota-vigesimal");
  const groupBinario = document.getElementById("group-nota-binario");

  const cicloSelect = document.getElementById("tarea-ciclo-select");
  const studentSearchInput = document.getElementById("tarea-student-search");
  const studentCodeInput = document.getElementById("tarea-codigo-estudiante");

  populateSemanasTareasForm();

  if (cicloSelect && studentSearchInput) {
    cicloSelect.addEventListener("change", () => {
      const ciclo = cicloSelect.value;
      studentSearchInput.value = "";
      if (studentCodeInput) studentCodeInput.value = "";

      if (ciclo) {
        studentSearchInput.placeholder = `🔍 Buscar estudiante del ciclo ${ciclo}...`;
      } else {
        studentSearchInput.placeholder = "🔍 Selecciona primero un ciclo / salón...";
      }
    });
  }

  if (tipoEvalSelect && groupVigesimal && groupBinario) {
    const updateModalidadVisibilidad = () => {
      const mode = tipoEvalSelect.value;
      if (mode === "vigesimal") {
        groupVigesimal.classList.remove("is-hidden");
        groupVigesimal.style.setProperty("display", "block", "important");

        groupBinario.classList.add("is-hidden");
        groupBinario.style.setProperty("display", "none", "important");
      } else if (mode === "binario") {
        groupVigesimal.classList.add("is-hidden");
        groupVigesimal.style.setProperty("display", "none", "important");

        groupBinario.classList.remove("is-hidden");
        groupBinario.style.setProperty("display", "block", "important");
      } else {
        groupVigesimal.classList.add("is-hidden");
        groupVigesimal.style.setProperty("display", "none", "important");

        groupBinario.classList.add("is-hidden");
        groupBinario.style.setProperty("display", "none", "important");
      }
    };

    tipoEvalSelect.addEventListener("change", updateModalidadVisibilidad);
    updateModalidadVisibilidad();
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("msg-registro-tarea");

      const cursoSelect = document.getElementById("tarea-curso-select");
      const curso = cursoSelect ? cursoSelect.value.trim() : "";
      const ciclo = document.getElementById("tarea-ciclo-select")?.value;
      const semanaSelect = document.getElementById("tarea-semana-select");
      const fecha = semanaSelect ? semanaSelect.value : "";
      const tipoEvaluacion = tipoEvalSelect?.value;
      const codigoEstudiante = document.getElementById("tarea-codigo-estudiante")?.value.trim();

      if (!curso) {
        msg.innerHTML = '<span style="color:red;">Debes seleccionar un curso predeterminado válido.</span>';
        return;
      }

      if (!ciclo || !codigoEstudiante) {
        msg.innerHTML = '<span style="color:red;">Debes seleccionar el ciclo y el estudiante.</span>';
        return;
      }

      let nota = null;
      let estado = "EVALUADO";

      if (tipoEvaluacion === "vigesimal") {
        const valNum = parseFloat(document.getElementById("tarea-nota-vigesimal").value);
        if (isNaN(valNum) || valNum < 0 || valNum > 20) {
          msg.innerHTML = '<span style="color:red;">La nota vigesimal debe ser un número entre 0 y 20.</span>';
          return;
        }
        nota = valNum;
      } else {
        const radioChecked = document.querySelector('input[name="tarea-binario-radio"]:checked');
        estado = radioChecked ? radioChecked.value : "PRESENTÓ";
      }

      const registros = [{ codigoEstudiante, nota, estado }];

      try {
        const res = await fetch("/api/evaluaciones/tareas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ curso, ciclo, fecha, tipoEvaluacion, registros }),
        });

        const data = await res.json();
        if (data.exito) {
          const studentSearchEl = document.getElementById("tarea-student-search");
          const nombreEst = studentSearchEl ? studentSearchEl.value : `Estudiante [${codigoEstudiante}]`;

          msg.innerHTML = `
            <div id="tarea-success-alert" style="background:#f0fdf4; border:1px solid #86efac; padding:10px 14px; border-radius:8px; margin-top:8px; transition: opacity 0.5s ease;">
              <b style="color:#166534;">✅ Calificación guardada para ${nombreEst}.</b><br/>
              <span style="font-size:0.85rem; color:#475569;">Curso: <b>${curso}</b> | Salón: <b>${ciclo}</b></span>
            </div>
          `;

          if (window._tareaSuccessMsgTimeout) clearTimeout(window._tareaSuccessMsgTimeout);
          window._tareaSuccessMsgTimeout = setTimeout(() => {
            const alertEl = document.getElementById("tarea-success-alert");
            if (alertEl) {
              alertEl.style.opacity = "0";
              setTimeout(() => {
                if (msg) msg.innerHTML = "";
              }, 500);
            }
          }, 4500);

          await cargarHistorialTareas();

          const selectTareasSalonCiclo = document.getElementById("excel-tareas-ciclo-select");
          if (selectTareasSalonCiclo && selectTareasSalonCiclo.value) {
            await cargarSemanasExcelConsolidado(selectTareasSalonCiclo.value);
          }
        } else {
          msg.innerHTML = `<span style="color:red;">❌ ${data.mensaje}</span>`;
        }
      } catch (err) {
        msg.innerHTML = '<span style="color:red;">❌ Error al conectar con el servidor.</span>';
      }
    });
  }

  const btnExportTareasSalon = document.getElementById("btn-export-tareas-salon-excel");
  const selectTareasSalonCiclo = document.getElementById("excel-tareas-ciclo-select");
  const selectTareasSalonSemana = document.getElementById("excel-tareas-semana-select");

  if (selectTareasSalonCiclo) {
    selectTareasSalonCiclo.addEventListener("change", () => {
      cargarSemanasExcelConsolidado(selectTareasSalonCiclo.value);
    });
  }

  if (btnExportTareasSalon && !btnExportTareasSalon.dataset.listener) {
    btnExportTareasSalon.dataset.listener = "true";
    btnExportTareasSalon.addEventListener("click", () => {
      const ciclo = selectTareasSalonCiclo ? selectTareasSalonCiclo.value.trim() : "";
      const semana = selectTareasSalonSemana ? selectTareasSalonSemana.value.trim() : "";

      if (!ciclo) {
        alert("Por favor, selecciona un salón / ciclo para exportar su consolidado de tareas.");
        return;
      }
      window.location.href = `/api/evaluaciones/tareas/excel-salon?ciclo=${encodeURIComponent(
        ciclo
      )}&semana=${encodeURIComponent(semana)}`;
    });
  }

  window._cargarSemanasExcelConsolidado = cargarSemanasExcelConsolidado;
  cargarHistorialTareas();
}
