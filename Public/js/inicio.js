document.getElementById("btn-inicio").addEventListener("click", function (e) {
  e.preventDefault();
  const box = document.querySelector(".box-header");
  box.innerHTML = `
      <img src="./img/universidades.png" alt="Universidades" />
        <div class="text-header">
          <span>Grupo Ingemat</span>
          <h1>CONTIGO HASTA<br />TU INGRESO</h1>
          <a href="#" class="btn-red">Nuestros ciclos</a>
        </div>
    `;
});
