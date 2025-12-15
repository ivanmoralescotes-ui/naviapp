
const gists = new Map([
  ["prop11111111.txt", "e1a872f457ed67a62b48e3c215433972"],
  ["prop11121197.txt", "b10ff3e6d9a8dd1d680d62c6d964590b"],
  ["propnavi.txt", "5da599743c686628d2bf96f6ac03c9b0"]
  
  ,["prop11121689.txt", "4bb48be499e99c8e9bbcfe4b63ff9e38"]
  ,["prop11122058.txt", "40c522ea8fc8fc60b4bff319977aa7f0"]
  ,["prop11123657.txt", "a93237c990ff78e832a7af3faa4e0974"]
  ,["prop11122550.txt", "70eb094abd17432c851c90ce38f31f6c"]
  ,["prop11122181.txt", "b6f3c2647d2375ac64f55c0cb9e3151c"]
  
  ,["prop11111234.txt", "83a00849e0ed5206d2e76774e0dee1ae"]
  
  //,["prop.txt", ""]
]);

const quotes = [
	    "“La disciplina empieza donde termina la motivación.”",
	    "“Hazlo sencillo, pero hazlo siempre.”",
        "“Cambia tus hábitos y cambia tu destino.”",
		"“Lo que repites, te construye.”",
        "“La acción cura el miedo.”",
		"“Tu futuro empieza hoy, no mañana.”",
		"“El que se controla, vence.”",
		"“No te rindas: ajusta el plan, no el objetivo.”",
		"“Avanza aunque sea un milímetro.”",
		"“Haz lo difícil hasta que sea fácil.”",
		"“La mente fuerte escucha, decide y actúa.”",
		"“Quien domina su atención, domina su mundo.”",
		"“El progreso ama la constancia.”",
		"“Tu vida mejora cuando tú mejoras.”",
		"“Haz más de lo que dices y di menos de lo que haces.”",
		"“Deja de esperar y empieza a construir.”",
		"“Avanza sin hacer ruido.”",
		"“Si te caes siete veces, levántate ocho.”",
		"“Siembra disciplina y cosecharás libertad.”",
		"“La vida premia a los constantes.”",
		"“Mejora un 1% cada día.”",
		"“Hazlo por ti, no por aplausos.”",
		"“Menos excusas, más acción.”",
        "“El secreto para salir adelante es comenzar.”",
		"“Constancia mata talento cuando el talento no es constante.”",
		"“El que persiste, llega.”",
		"“No te detengas: ajusta el ritmo, no el camino.”",
		"“Sé fuerte cuando nadie te ve.”",
		"“No esperes milagros: construye hábitos.”",
		"“Cada día es una oportunidad nueva.”",
		"“Persevera incluso cuando no tengas ganas.”",
		"“Hazlo aunque duela.””",
		"“Pequeños avances crean grandes cambios.”",
		"“Si controlas tus mañanas, controlas tu vida.”",
		"“Lo que empiezas, lo terminas.”",
		"“La constancia convierte metas en realidad.”"
		
		// "“”",
	];
	
const versiculos =[
	    "“Jesús dijo: Todo es posible para el que cree.” (Marcos 9:23)"
	   ,"“Y Jesús dijo: No temas; cree solamente.” (Marcos 5:36)"
	   ,"“Jesús dijo: Todo es posible para el que cree.” (Marcos 9:23)"
	   ,"“Jesús le dijo: No te he dicho que si crees verás la gloria de Dios?” (Juan 11:40)"
	   ,"“Y Jesús dijo: Yo estoy con ustedes todos los días, hasta el fin del mundo.” (Mateo 28:20)"
	   ,"“El Señor es mi pastor, nada me falta.” (Salmo 23:1)"
	   ,"“Porque todo aquel que invoque el nombre del Señor será salvo.” (Romanos 10:13)"
	   ,"“Deléitate en el Señor, y él te concederá los deseos de tu corazón.” (Salmo 37:4)"
	   ,"“El Señor es mi fortaleza y mi escudo.” (Salmo 28:7)"
	   ,"“El Señor sostiene a los que caen.” (Salmo 145:14)"
	   ,"“El Señor dirige los pasos del hombre.” (Salmo 37:23)"
	   ,"“El Señor te dará fuerzas y te sostendrá.” (Isaias 41:10)"
	   ,"“Confía en el Señor y Él actuará.” (Salmo 37:5)"
	   ,"“Él da fuerzas al cansado y multiplica las fuerzas del débil.” (Isaias 40:29)"
	   ,"“El Señor te fortalecerá y te ayudará; te sostendrá con su mano victoriosa.” (Isaias 41:10)"
	   ,"“Entréguenle todas sus preocupaciones a Dios, porque Él cuida de ustedes.” (Pedro 5:7)"
	   
	   //,"“”"
	   
	   ];
	   
function obtenerVersiculo(){	
	const versiculoNumber = getRandomNumber(0,(versiculos.length-1) );
	return versiculos[versiculoNumber];
}

function obtenerFrase(){
	const quoteNumber = getRandomNumber(0,(quotes.length-1) );
	return quotes[quoteNumber];
}

function obtenerNumeroAleatorio(){
	return getRandomNumber(0,36);
}

function getRandomNumber(min, max) {
	  min = Math.ceil(min);
	  max = Math.floor(max);
	  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getGistId(filename){
	//return gists.get(filename);
	//return "b10ff3e6d9a8dd1d680d62c6d964590b";
	return "83a00849e0ed5206d2e76774e0dee1ae";
}

function getDisplayTime(){
	
	return 7000;
}

