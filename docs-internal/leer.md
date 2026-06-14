me gustaria que para openhire, si una empresa ya tiene una pagina de careers, con integrar un codigo o poner ciertas cosas, pueda tenerlo integrado en su web existente y conectarlo al ats self-hosted. entiendes??


algo así.


viste que está la pagina natural y abajo el contenido de greenhouse para los trabajos?? 

Lo que estás viendo ahí (el clásico listado de vacantes que se inyecta dinámicamente dentro del sitio web de una empresa) se conoce comúnmente como un Widget o un Script de integración (Embed Script).

es la a tendencia moderna —especialmente la que usan ATSs grandes como Greenhouse, Lever o Ashby— es usar un Script JS con un contenedor HTML.

1. El enfoque moderno: Script JS + Contenedor (Recomendado)

Es exactamente lo que suele hacer Greenhouse. Le das a la empresa un bloque de código muy sencillo para que lo pegue en su HTML:
HTML

<div id="openhire-jobs-container"></div>

<script 
  src="https://cdn.openhire.com/widget.js" 
  data-company-id="id_de_la_empresa"
  defer>
</script>

    Cómo funciona por detrás: Tu archivo widget.js hace un fetch() a la API pública de tu OpenHire self-hosted para traer el JSON de los puestos activos de esa empresa. Luego, con JS, genera los elementos del DOM (la barra de búsqueda, los filtros por departamento/oficina y la lista de puestos) y los mete dentro del div.

    Ventajas: Es 100% responsive, se adapta de forma natural a las tipografías y estilos globales del sitio web de la empresa (hereda el CSS del cliente) y es excelente para el SEO de ellos si usas técnicas de hidratación o renderizado limpio.

---

hay que implementar esto junto con los webhooks y la api.
