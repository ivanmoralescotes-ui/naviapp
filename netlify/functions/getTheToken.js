// archivo: functions/getGitHubToken.js

exports.handler = async (event, context) => {
  // Aquí obtienes el token desde la variable de entorno
  const githubToken = process.env.THE_TOKEN;
  
  // Retornas el token (o idealmente, usas el token aquí para hacer alguna petición a GitHub y devolver el resultado)
  return {
    statusCode: 200,
	headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    },
    body: JSON.stringify({ token: githubToken })
  };
};
