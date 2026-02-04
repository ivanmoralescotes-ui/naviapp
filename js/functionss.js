import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  initializeFirestore,
  collection,
  getDocs,
  query, where
  , doc, updateDoc ,setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";





const firebaseConfig = {
  apiKey: await obtenerApiK(),
  authDomain: "qrpro-f4709.firebaseapp.com",
  projectId: "qrpro-f4709",
  storageBucket: "qrpro-f4709.firebasestorage.app",
  messagingSenderId: "625303344201",
  appId: "1:625303344201:web:cfac300229e2e48a6a5b98"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await signInAnonymously(auth);


// CLAVE PARA FIREFOX
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});


/*async function obtenerDatos() {
  const snap = await getDocs(collection(db, "configg"));
  snap.forEach(doc => {
    console.log(doc.id, doc.data());
  });
}*/

async function obtenerApiK(){
  	
  //const response = await fetch('/.netlify/functions/getApiK');
  const response = await fetch('https://navi111.netlify.app/.netlify/functions/getApiK');
  
  //const response = await fetch('"http://localhost:3000/.netlify/functions/getApiK"');           
  
  const data = await response.json(); //await response.json();
  //console.log("apik is" + data );
  return data.apik;

	//const tokenurl ="https://navi111.netlify.app/.netlify/functions/getTheToken";	
				/*
		fetch(tokenurl)
			.then(response => response.json())
			.then(async (data) => {				
				ghubt=data.token;	
			});*/
	
	
	//return "";
}

export async function obtenerDatos() {
  const snap = await getDocs(collection(db, "configg"));
  snap.forEach(   doc => {
	  console.log( doc.id, doc.data() );
	  console.log("seg:"+doc.data().segundosslide );
	  console.log("img:"+doc.data().images[0] );
  } );
}

//obtenerDatos();

export async function obtenerFila( codigo ) {

	const q = query(
	  collection(db, "configg"),
	  where("code", "==", codigo )
	);
	const snapshot = await getDocs(q);
    let response = null;
	
	snapshot.forEach((doc) => {
	  console.log("-----",doc.id, doc.data());
	  response = doc.data();
	});
	console.log( "obteniendoFila " + JSON.stringify(response) );
	return JSON.stringify(response);
}

/*export async function consultarPorId(idd) {
  const docRef = doc(db, "configg", idd);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    console.log("Documento no existe");
    return null;
  }
  console.log("Datos:" + snap.data());
  console.log("Datoss:" + JSON.stringify( snap.data() ));
  //return JSON.stringify( snap.data() );
  return  snap.data() ;
}*/

export async function consultarPorId(idd) {
  try {
	  if (!idd) {
		console.warn("ID inválido:", idd);
		return null;
	  }

    const docRef = doc(db, "configg", idd);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      console.warn("Documento no existe:", idd);
      return null;
    }

    const data = snap.data();
    console.log("Datoss:", data);

    return data;
  } catch (err) {
    console.error("Error consultando Firestore:", err);
    return null;
  }
}



export async function actualizarCampo(nombree) {
  const docRef = doc(db, "configg", "I2qsAbMNgQfKlKTXmX52");

  await updateDoc(docRef, {
    nombre: nombree
  });  
  console.log("Campo actualizado");
  
}

export async function insertarConId(miId, nombree, whatsapp1, instagram1) {
  const docRef = doc(db, "configg", miId);

  await setDoc(docRef, {
    nombre: nombree,
    whatsapp: whatsapp1,
    instagram: instagram1
  });
  console.log("Documento creado con ID fijo");

}


export async function upsertConId(miId, nombre1, whatsapp1, instagram1,
    tipoIa1,lastupdate1,isEnglish1,segundosslide1,palabras1,clave1,akey1,
	versiculo1,motivacional1,numerosuerte1,spotify1,linkpublicidad1,nombrepublicidad1,images1, linkdirecto1) {
	await setDoc(
	  doc(db, "configg", miId),
	  { 
	    instagram: instagram1,
	    nombre: nombre1,
        whatsapp: whatsapp1,
		
		tipoIa:tipoIa1,
		lastupdate:lastupdate1,
		isEnglish:isEnglish1,
		segundosslide:segundosslide1,
		palabras:palabras1,
		clave:clave1,
		akey:akey1,
		versiculo:versiculo1,
		motivacional:motivacional1,
		numerosuerte:numerosuerte1,
		spotify:spotify1,
		linkpublicidad:linkpublicidad1,
		nombrepublicidad:nombrepublicidad1,
		images:images1,
        linkdirecto: linkdirecto1		
      },
	  { merge: true }
	);
    console.log("upsert..");
}

export async function insertMany() {
  upsertConId("prop11111603","","","",
     "","2026-01-01T01:27:14.330Z","no","8","","1539232","",
	 "no","si","no","","",
	 "", [ "https://i.imgur.com/ZYbySOV.jpg", "https://i.imgur.com/2RBU19s.jpg"] );
  
  upsertConId("prop11111726","","","",
     "","2026-01-01T01:27:15.330Z","no","8","","1539232","",
	 "no","si","no","","",
	 "", [ "https://i.imgur.com/ZYbySOV.jpg", "https://i.imgur.com/2RBU19s.jpg"] );
  
  console.log("many were inserted..");

}