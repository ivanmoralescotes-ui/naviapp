// archivo: functions/getApiK.js

exports.handler = async (event, context) => {
  // Aquí obtienes el token desde la variable de entorno
  const apiK = process.env.APIK; // "11";
  
  // Retornas el token (o idealmente, usas el token aquí para hacer alguna petición a GitHub y devolver el resultado)
  return {
    statusCode: 200,
	headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    },
    body: JSON.stringify({ apik: apiK })
  };
};
