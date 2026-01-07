// Public/js/admin/whatsapp/wa-manual.js
import { allUserOptions, generarCarnetBase64 } from "../users.js";

export function initManualSend() {
    const searchInput = document.getElementById('manual-carnet-search');
    const hiddenInput = document.getElementById('manual-carnet-codigo-hidden');
    const resultsContainer = document.getElementById('manual-carnet-results');
    const phoneInput = document.getElementById('manual-carnet-phone');
    const btnSend = document.getElementById('btn-manual-send-carnet');
    const msgDiv = document.getElementById('msg-manual-send');

    if (!searchInput || !btnSend) return;

    // 1. Autocompletado Simple
    searchInput.addEventListener('input', function() {
        const val = this.value.toLowerCase().trim();
        resultsContainer.innerHTML = '';
        if (val.length < 2) return;

        // Filtrar usuarios (máx 6 resultados para no saturar)
        const matches = allUserOptions.filter(u => {
            const full = `${u.nombre} ${u.apellido} ${u.codigo}`.toLowerCase();
            return full.includes(val);
        }).slice(0, 6);

        matches.forEach(u => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = `<strong>${u.nombre} ${u.apellido}</strong> <br><small>${u.codigo} - ${u.rol}</small>`;
            div.onclick = () => {
                searchInput.value = `${u.nombre} ${u.apellido}`;
                hiddenInput.value = u.codigo;
                resultsContainer.innerHTML = ''; // Cerrar lista
            };
            resultsContainer.appendChild(div);
        });
    });

    // Cerrar lista al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (e.target !== searchInput) resultsContainer.innerHTML = '';
    });

    // 2. Evento Enviar
    btnSend.onclick = async () => {
        const codigo = hiddenInput.value;
        const phone = phoneInput.value.trim();

        msgDiv.className = 'form-message'; // Reset clase
        msgDiv.textContent = '';

        if (!codigo) {
            alert("Selecciona un usuario de la lista.");
            return;
        }
        if (!phone || phone.length < 9) {
            alert("Ingresa un número válido (mínimo 9 dígitos).");
            return;
        }

        const usuario = allUserOptions.find(u => u.codigo === codigo);
        if (!usuario) return;

        try {
            // UI Loading
            btnSend.disabled = true;
            btnSend.innerHTML = `<i class="bi bi-hourglass-split"></i> Generando...`;

            // A. Generar Imagen
            const base64 = await generarCarnetBase64(usuario);

            // UI Enviando
            btnSend.innerHTML = `<i class="bi bi-whatsapp"></i> Enviando...`;

            // B. Petición al Backend
            const res = await fetch('/whatsapp/api/send-carnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: phone.startsWith('51') ? phone : `51${phone}`, // Asumimos prefijo Perú por defecto si falta
                    imageBase64: base64,
                    nombre: usuario.nombre
                })
            });

            const data = await res.json();

            if (data.exito) {
                msgDiv.style.color = '#198754';
                msgDiv.innerHTML = `✅ ${data.mensaje} <br>Enviado a: <b>${usuario.nombre}</b> (${phone})`;
                // Limpiar
                searchInput.value = '';
                hiddenInput.value = '';
                phoneInput.value = '';
            } else {
                throw new Error(data.mensaje);
            }

        } catch (err) {
            console.error(err);
            msgDiv.style.color = '#dc3545';
            msgDiv.textContent = `❌ Error: ${err.message}`;
        } finally {
            btnSend.disabled = false;
            btnSend.innerHTML = `<i class="bi bi-send-fill"></i> Enviar`;
        }
    };
}