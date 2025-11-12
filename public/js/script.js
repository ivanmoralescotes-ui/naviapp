//import axios from './axios';
//import { * as axios } from 'https://unpkg.com/axios/dist/axios.min.js';
//const axios = require('axios');

/*window.onload = async () => {
  console.log('Page loaded, calling async function...');
   myAsyncFunction();//await
  console.log('Async function completed.');
};*/


// public/script.js
//function myAsyncFunction(){ 
    document.addEventListener('DOMContentLoaded', () => {
        const button = document.getElementById('sendButton');
	
		const inputArea = document.getElementById('inputArea');
		const thetable = document.getElementById('thetable');
        const chooseButton = document.getElementById('chooseButton');		
		
		//if (thetable && thetable.value != "t0"){		
		//	sessionStorage.setItem("thetablee", thetable.value);
		//}
		const thetablee = sessionStorage.getItem("thetablee"); 
		console.log("thetablee:"+thetablee);
		
		if (thetablee != null && thetablee!="t0"){
			thetable.style.display = "none";
			chooseButton.style.display = "none";
		}
			
		
        if (button) {

            button.addEventListener('click', async () => {
		
			const acode = document.getElementById('acode');
			const thetype = document.getElementById('thetype');
		
			if (acode.value == ""){
				alert("Invalid parameter");
				return;
			}

			const acodehash =  await hashStringSHA256(acode.value); 

            if (acodehash != "65ab749279c8fbe6d2305db2141ed892e39a80a6823946aaf272414392720ad6"
			  && acodehash != "41c991eb6a66242c0454191244278183ce58cf4a6bcd372f799e4b9cc01886af"
			  && acodehash != "2926a2731f4b312c08982cacf8061eb14bf65c1a87cc5d70e864e079c6220731"
			  ){//55
		  		    alert("Invalid value");
					return;
			    }else{
					console.log("ok");
				}

				const postData = {
					message: inputArea.value , // "what is the epm code"
					atype: thetype.value,
					thecode: acode.value					
				};

                console.log("postData:"+postData.message+"__Table"+thetablee);

				//axios.post('http://localhost:3000/api/messag'  

				const ur = "aHR0cHM6Ly9hZ2VudDEubmdyb2sucHJvL2FwaS9tZXNzYWdl";
				const ur2 = atob(ur);
				//https://agen.ngrok.pro/api/messag
				axios.post(ur2  //toDo c84e589f3baa.ngrok-free.app 
					, postData, 
				{
					headers: {
						//'Authorization': basicAuthHeader,
						'Content-Type': 'application/json' // Set appropriate content type
					}
				})
				.then(response => {
					console.log('the response is:', response.data);
					var theresponse = response.data;

					//alert('Button clicked');
					const responseArea = document.getElementById('responseArea');
					if (responseArea) {
						responseArea.value = responseArea.value + inputArea.value + "\n"
						   +theresponse + "\n------------------------\n";
						inputArea.value ="";
						inputArea.focus();
					}else{
						console.log("responseArea is not there");
					}
					//res.status(201).json( "-------------" + postData.message + "-------------" + theresponse); // 201
				})
				.catch(error => {
					console.error('Error:', error);
				});

			//const acodehash =   getSha256(acode.value);
			//getSha256(acode.value)
			  //.then(sha256Hash => {
				//console.log("SHA-256 hash:", sha256Hash);
			  //})
			  //.catch(error => {
				//console.error("Failed to get SHA-256 hash:", error);
			  //});

            });
        }
		
		const cleanButton = document.getElementById('cleanButton');
        if (cleanButton) {
            cleanButton.addEventListener('click', () => {
				                
				//alert('Button clicked');
				const responseArea = document.getElementById('responseArea');
				const acode=document.getElementById('acode');

				if (responseArea) {
					responseArea.value="";
					acode.value="";
					inputArea.focus();
				}
            });
        }
		
        if (chooseButton) {
            chooseButton.addEventListener('click', () => {
				//const thetable = document.getElementById('thetable');
				console.log("thetable is :"+thetable.value);
				
				thetable.style.display = "none";
				chooseButton.style.display = "none";
				sessionStorage.setItem("thetablee", thetable.value);
            });
        }
		
    });
//}


async function hashStringSHA256(message) {
  // Encode the string as a Uint8Array using TextEncoder
  const msgBuffer = new TextEncoder().encode(message);

  // Hash the message using SHA-256 with crypto.subtle.digest
  const hashBuffer =  await crypto.subtle.digest('SHA-256', msgBuffer);//await

  // Convert the ArrayBuffer to an array of bytes
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // Convert the byte array to a hexadecimal string representation
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

function getSha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  return window.crypto.subtle.digest("SHA-256", data)
    .then(hashBuffer => {
      // Convert the ArrayBuffer to a hexadecimal string
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hexHash;
    })
    .catch(error => {
      console.error("Error calculating SHA-256 hash:", error);
      throw error; // Re-throw the error for further handling
    });
}

