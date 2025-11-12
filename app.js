const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const port = 3000;
const path = require('path'); // Import path module for better path handling
const cors = require('cors'); 

const corsOptions = {
  origin: 'http://localhost:3000', // Replace with your frontend origin(s)
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed request headers
  credentials: true // Allow cookies or other credentials
};

app.use(cors(corsOptions));
// Middleware to parse JSON request bodies
app.use(express.json());

    // Serve static files from the 'public' directory
    app.use(express.static(path.join(__dirname, 'public')));

    // Define a route to serve your main HTML file
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'messagee.html'));
    });	
	
// In-memory data store (for demonstration purposes)
let users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
];

// GET all users
app.get('/api/users', (req, res) => {
    res.json(users);
});

// GET a specific user by ID
app.get('/api/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    const user = users.find(u => u.id === userId);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
});

// POST a new user
app.post('/api/users', (req, res) => {
    const newUser = {
        id: users.length + 1,
        name: req.body.name,
        email: req.body.email
    };
    users.push(newUser);
    res.status(201).json(newUser); // 201 Created
});

// PUT (update) an existing user
app.put('/api/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    let user = users.find(u => u.id === userId);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    res.json(user);
});

// DELETE a user
app.delete('/api/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    const initialLength = users.length;
    users = users.filter(u => u.id !== userId);

    if (users.length === initialLength) {
        return res.status(404).json({ message: 'User not found' });
    }
    res.status(204).send(); // 204 No Content
});

const basicAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Unauthorized: No Authorization header');
    }

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const username = auth[0];
    var passwoord = auth[1];

    // Replace with your actual username and password or a database check
	passwoord = createSHA256Hash(passwoord);

    if (username === 'navi' 
         && passwoord === '787e126b50dd119ba0a170479a51468ae1c4388febdb320d8dfc58999ffa3f22') {//toDo cool25 m
        next(); // User authenticated, proceed to the next middleware/route handler
    } else {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Unauthorized: Invalid credentials');
    }
};


app.post('/api/message', basicAuth,    (req, res) => {
    const newMessage = {
        value: req.body.message
    }; 
	
	const thetype = req.body.atype;
	const thecode = req.body.thecode;
	console.log("thetype:"+thetype);
	
	const username = atob('bmF2aQ=='); //nav
    const passwordd = atob('dG9vbDI1aQ==');//toDo dG9vbDI1aQ==   cool25i

	//passwordd=decode(passwordd);

    const credentials = btoa(`${username}:${passwordd}`); // btoa is available in browser environments
	const basicAuthHeader = `Basic ${credentials}`;
			
	const postData = {
        aninput: newMessage.value
    };
    var theresponse = "a";
	
	var theurl = "https://ivanmorales.app.n8n.cloud/webhook/message3";

    //relation between types and services
	if (thetype == "type2" && thecode == "7777" ){ //toDo
		theurl = "https://ivanmorales.app.n8n.cloud/webhook/message4";//i
	}else if (thetype =="type1" && thecode == "5577"){
		theurl = "https://ivanmorales.app.n8n.cloud/webhook/message3";//system
	}else if (thetype =="type3" && thecode == "8888"){
		theurl = "https://ivanmorales.app.n8n.cloud/webhook/message5";//resta
	}else{
		console.log("unexpected input");
		res.status(200).json("{\"output\":\"unexpected\"}"); 
		return;
	}

    axios.post(theurl //toDo
        
        , postData, 
		{
			headers: {
				'Authorization': basicAuthHeader,
				'Content-Type': 'application/json' // Set appropriate content type
			}
		})
        .then(response => {
            console.log('the response:', response.data);
			theresponse = response.data;
			//res.status(201).json( newMessage.value 
			//	+ "\n-------------\n" + theresponse + "\n*************************\n\n"); // 201 Created
			res.status(201).json(theresponse); // 201 Created
        
        })
        .catch(error => {
            console.error('Error:', error);
        });
	
    //res.status(201).json("received: " + req.body.message + "_" + theresponse); // 201 Created
});


// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

function createSHA256Hash(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}