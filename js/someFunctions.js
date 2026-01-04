
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
		
		
		,"“La motivación enciende; el hábito mantiene la llama.”",
"“Lo importante no es perfecto: es constante.”",
"“Hazlo hoy con el cuerpo; mañana te sigue la mente.”",
"“Tu paz vale más que tu prisa.”",
"“Elige progreso, no perfección.”",
"“Lo que no mides, se te escapa.”",
"“La claridad llega caminando.”",
"“Tu atención es tu energía.”",
"“Cuando dudas, vuelve a lo básico.”",
"“Haz espacio para lo que importa.”",
"“Tu estándar decide tu destino.”",
"“El carácter se entrena, no se improvisa.”",
"“Sé paciente con el proceso; no con la excusa.”",
"“No todo se siente bien, pero todo enseña.”",
"“El foco es un superpoder.”",
"“Hazlo lento, pero sin pausa.”",
"“Donde hay orden, hay calma.”",
"“La incomodidad es señal de crecimiento.”",
"“La vida cambia cuando cambias tus decisiones.”",
"“Tu yo futuro te está mirando.”",
"“La acción pequeña gana guerras grandes.”",
"“Aprende a empezar antes de estar listo.”",
"“No negocies con tu mejor versión.”",
"“Tu rutina es tu rumbo.”",
"“Lo simple bien hecho es poderoso.”",
"“La energía sigue a la intención.”",
"“Hazlo por orgullo propio.”",
"“La confianza se construye cumpliéndote.”",
"“Más verdad, menos drama.”",
"“Un paso honesto vale más que mil planes.”",
"“Tu mente cree lo que practicas.”",
"“No te compares: compite contigo.”",
"“Sé constante, no intenso.”",
"“El cansancio no decide; tú decides.”",
"“Haz lo correcto, aunque sea incómodo.”",
"“La paciencia también es fuerza.”",
"“La disciplina es amor propio en acción.”",
"“Gana el día y ganarás el año.”",
"“La repetición crea identidad.”",
"“Si no te suma, te resta.”",
"“Tus límites se entrenan.”",
"“La vida mejora con decisiones valientes.”",
"“No te falta tiempo: te falta enfoque.”",
"“Hazlo aunque sea imperfecto.”",
"“El progreso se nota en silencio.”",
"“Un buen día se diseña.”",
"“La constancia es fe práctica.”",
"“Tu palabra contigo es sagrada.”",
"“El miedo se hace pequeño cuando actúas.”",
"“Cuida tu mente como cuidas tu casa.”",
"“Menos quejas, más ajustes.”",
"“Descansar también es estrategia.”",
"“Lo que toleras, lo eliges.”",
"“Empieza donde estás, con lo que tienes.”",
"“La mente se calma cuando el cuerpo se mueve.”",
"“Tu futuro se construye en lo cotidiano.”",
"“Hazlo fácil de empezar.”",
"“Hazlo difícil de abandonar.”",
"“Si te importa, lo agendas.”",
"“La disciplina es el puente a la libertad.”",
"“Tu identidad sigue tus acciones.”",
"“Hazte cargo y se te abre el camino.”",
"“Cambia el ‘algún día’ por ‘hoy’.”",
"“La excelencia nace de lo básico.”",
"“La paz es un hábito.”",
"“Respira, decide, actúa.”",
"“No necesitas suerte: necesitas sistema.”",
"“Haz menos, pero mejor.”",
"“La consistencia gana en largo plazo.”",
"“La emoción pasa; el resultado queda.”",
"“Tu enfoque vale oro.”",
"“El autocontrol es poder silencioso.”",
"“No te distraigas con lo que no suma.”",
"“La voluntad se fortalece usándola.”",
"“Tu vida cambia con pequeñas promesas cumplidas.”",
"“Hazlo por respeto a tu tiempo.”",
"“Lo que haces a diario te define.”",
"“No esperes ánimo; crea impulso.”",
"“Tu mente necesita dirección, no presión.”",
"“El esfuerzo hoy es alivio mañana.”",
"“La incomodidad de hoy es la fuerza de mañana.”",
"“Elige hábitos que te cuiden.”",
"“Hazte responsable de tu energía.”",
"“Donde pones atención, creces.”",
"“Tu disciplina es tu ventaja.”",
"“No todo se logra rápido; se logra constante.”",
"“El pensamiento sin acción es ruido.”",
"“La calma también es productividad.”",
"“La vida te responde a lo que sostienes.”",
"“Haz lo que dijiste que harías.”",
"“No te sabotees por impaciencia.”",
"“Sé firme, pero amable contigo.”",
"“Tu mejor versión se construye en días normales.”",
"“Pequeño hoy, enorme en un año.”",
"“No busques inspiración: busca dirección.”",
"“El hábito correcto te ahorra decisiones.”",
"“La disciplina es elegir a largo plazo.”",
"“Cada ‘sí’ tiene un costo: elige bien.”",
"“Tu mente se entrena con lo que consumes.”",
"“El control interno es verdadera libertad.”",
"“Hazlo constante y se vuelve parte de ti.”",
"“No te rompas: reajusta.”",
"“El progreso real no necesita aplausos.”",
"“La vida se ordena cuando tú te ordenas.”",
"“Elige una cosa y hazla bien hoy.”"


		
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
	   
	   
	   ,"“El Señor es bueno; su amor es eterno.” (Salmo 100:5)",
"“El Señor da paz a su pueblo.” (Salmo 29:11)",
"“En Dios está mi salvación y mi gloria.” (Salmo 62:7)",
"“El gozo del Señor es nuestra fortaleza.” (Nehemías 8:10)",
"“Dios es nuestro amparo y fortaleza.” (Salmo 46:1)",
"“El Señor escucha cuando lo invoco.” (Salmo 4:3)",
"“El Señor bendice al justo.” (Salmo 5:12)",
"“El Señor es cercano a los quebrantados.” (Salmo 34:18)",
"“El Señor cuida de todos los que lo aman.” (Salmo 145:20)",
"“Mi ayuda viene del Señor.” (Salmo 121:2)",
"“El Señor es mi luz y mi salvación.” (Salmo 27:1)",
"“El Señor es bueno con todos.” (Salmo 145:9)",
"“El amor del Señor nunca se acaba.” (Lamentaciones 3:22)",
"“Grande es la fidelidad del Señor.” (Lamentaciones 3:23)",
"“El Señor oye al justo cuando clama.” (Salmo 34:17)",
"“El Señor guarda tu salida y tu entrada.” (Salmo 121:8)",
"“Dios es fiel y justo.” (1 Juan 1:9)",
"“El Señor da sabiduría al humilde.” (Proverbios 11:2)",
"“El Señor endereza el camino del justo.” (Proverbios 3:6)",
"“El Señor da descanso a su pueblo.” (Éxodo 33:14)",
"“La paz de Dios guardará sus corazones.” (Filipenses 4:7)",
"“Todo lo puedo en Cristo que me fortalece.” (Filipenses 4:13)",
"“Dios es amor.” (1 Juan 4:8)",
"“El Señor es refugio para el oprimido.” (Salmo 9:9)",
"“El Señor colma de bienes tu vida.” (Salmo 103:5)",
"“El Señor cumple sus promesas.” (2 Pedro 3:9)",
"“El Señor te bendiga y te guarde.” (Números 6:24)",
"“La bondad del Señor llena la tierra.” (Salmo 33:5)",
"“El Señor levanta al humilde.” (Salmo 147:6)",
"“El Señor es justo en todos sus caminos.” (Salmo 145:17)",
"“El Señor es mi ayudador.” (Hebreos 13:6)",
"“El Señor da gracia a los humildes.” (Santiago 4:6)",
"“El Señor es misericordioso y compasivo.” (Salmo 103:8)",
"“El Señor protege al sencillo.” (Salmo 116:6)",
"“El Señor es mi roca.” (Salmo 18:2)",
"“Dios corona de amor y misericordia.” (Salmo 103:4)",
"“El Señor da fortaleza a su pueblo.” (Salmo 29:11)",
"“El Señor sana a los quebrantados.” (Salmo 147:3)",
"“El Señor es fiel en sus palabras.” (Salmo 145:13)",
"“El Señor renueva tus fuerzas.” (Isaías 40:31)",
"“El Señor guía con amor al justo.” (Salmo 25:9)",
"“El Señor está cerca de todos.” (Salmo 145:18)",
"“El Señor da vida en abundancia.” (Juan 10:10)",
"“El Señor llena de alegría el corazón.” (Salmo 19:8)",
"“El Señor protege a los que confían en Él.” (Proverbios 30:5)",
"“El Señor es mi esperanza.” (Salmo 71:5)",
"“El Señor sostiene al justo.” (Salmo 37:17)",
"“El Señor cuida de los justos.” (Salmo 34:20)",
"“El Señor ama la justicia.” (Salmo 37:28)",
"“El Señor escucha la oración.” (Salmo 65:2)",
"“El Señor es bueno y recto.” (Salmo 25:8)",
"“El Señor fortalece al cansado.” (Isaías 40:29)",
"“El Señor es mi refugio seguro.” (Salmo 91:2)",
"“El Señor cuida tu alma.” (Salmo 121:7)",
"“El Señor bendice a los que confían en Él.” (Jeremías 17:7)",
"“El Señor es mi auxilio.” (Salmo 118:7)",
"“El Señor da gracia y gloria.” (Salmo 84:11)",
"“El Señor protege con su verdad.” (Salmo 91:4)",
"“El Señor llena de paz a su pueblo.” (Isaías 26:3)",
"“El Señor es bueno en todo tiempo.” (Salmo 34:8)",
"“El Señor es mi fuerza y mi canto.” (Éxodo 15:2)",
"“El Señor escucha al humilde.” (Salmo 10:17)",
"“El Señor levanta al caído.” (Salmo 146:8)",
"“El Señor da vida eterna.” (Juan 3:16)",
"“El Señor es digno de confianza.” (Salmo 9:10)",
"“El Señor camina con los rectos.” (Proverbios 2:7)",
"“El Señor es mi defensor.” (Salmo 18:35)",
"“El Señor bendice al obediente.” (Proverbios 16:20)",
"“El Señor guarda a los suyos.” (Salmo 97:10)",
"“El Señor es mi esperanza viva.” (1 Pedro 1:3)",
"“El Señor da consuelo al triste.” (2 Corintios 1:3)",
"“El Señor es fiel y justo.” (1 Corintios 1:9)",
"“El Señor da paz al corazón.” (Juan 14:27)",
"“El Señor protege a los humildes.” (Salmo 138:6)",
"“El Señor es luz para el camino.” (Salmo 119:105)",
"“El Señor da sabiduría al que pide.” (Santiago 1:5)",
"“El Señor nunca abandona a los suyos.” (Salmo 94:14)",
"“El Señor es bueno con los que esperan.” (Lamentaciones 3:25)",
"“El Señor bendice el trabajo fiel.” (Proverbios 10:22)",
"“El Señor es fortaleza en la angustia.” (Nahúm 1:7)",
"“El Señor escucha al que confía.” (Salmo 40:1)",
"“El Señor restaura el alma.” (Salmo 23:3)",
"“El Señor llena de esperanza.” (Romanos 15:13)",
"“El Señor es paciente y bondadoso.” (Salmo 86:15)",
"“El Señor guarda al que lo ama.” (Salmo 145:20)",
"“El Señor da victoria al justo.” (Proverbios 21:31)",
"“El Señor acompaña al que cree.” (Salmo 16:8)",
"“El Señor es refugio eterno.” (Deuteronomio 33:27)"
	   
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
	//return "83a00849e0ed5206d2e76774e0dee1ae";
	return "ca5fa1cae5a1ace7396fe1b01d54b900";
}

function getDisplayTime(){
	
	return 6000; // 7000
}

