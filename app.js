const express = require('express');
const cors = require('cors')
const bodyParser = require('body-parser');
require("dotenv").config();
const clc = require("cli-color");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const validator = require("validator");
const session = require("express-session");
const mongoDbsession = require("connect-mongodb-session")(session); //(session) > we are finding this(session) inside 'connect-mongodb-session'



// OpenAI
const OpenAI= require('openai')
const openai = new OpenAI({
    apiKey: `${process.env.OPENAI_API_KEY}`,
})

// Import
const summarizeParagraph = require('./utils/summaryUtils');
const solution = require('./utils/codeUtils');
const saveChatModel = require('./models/saveChatModel');
const questions = require('./utils/questionsUtils');
const pdfDoubt = require('./utils/pdfDoubt');
const userModel = require('./models/userModel');
const { userDataValidation } = require('./utils/authUtils');
const { isAuth } = require('./middleware/authMiddleware');

// Variables
const app = express();
const PORT = process.env.PORT || 7000;
const store = new mongoDbsession({
    uri: process.env.URI,
    collection: "sessions",
});


// Middleware
app.use(cors({
    origin: 'https://ai-v3-front.vercel.app', // Allow requests from this origin
    // origin: 'http://localhost:3000', // Allow requests from this origin
    credentials: true // Allow credentials (cookies, authorization headers, etc.)
}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true })); //this is used for form data
app.use(express.json()); // this is used for hitting req from anywhere like postman and converting client data to json
// CORS Middleware
const corsMiddleware = (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://ai-v3-front.vercel.app');
    // res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
};
// Apply CORS Middleware globally
app.use(corsMiddleware);
// Session Middleware
app.use(
    session({ //session ni ky kela phje te apn hite sgtoy
      secret: process.env.SECRET_KEY,
      resave: false,
      saveUninitialized: false,
      store: store,
    })
);


// Databse Connection
mongoose.connect(process.env.URI)
 .then(() => console.log(clc.white.bgGreen.underline("Connected to Database")))
 .catch((err) => console.log(clc.bgRed(err)));


//  API's:
 app.get('/', function (req, res) {
    res.send('Welcome to the world of ai')
})

// SignUp:
app.post('/register', async(req, res)=>{
    console.log('req.body is >> ',req.body);
    const { name, email, username, password } = req.body;

    // Data validation
    try {
        await userDataValidation(name, email, username, password);
    } catch (error) {
        return res.send({
        status: 400,
        message: "Data error",
        error: error,
        });
    }

    //check if email and username already exist or not
    const usernameAlreadyExist = await userModel.findOne({username})
    if(usernameAlreadyExist){
        return res.send({
            status: 400,
            message: "Username already exists",
            alreadyUser: true
        });
    }

    const emailAlreadyExist = await userModel.findOne({email})
    if(emailAlreadyExist){
        return res.send({
            status: 400,
            message: "Email already exists",
            alreadyEmail: true
        });
    }

    // Bcrypt the password
    const hashedPassword = await bcrypt.hash(
        password,
        parseInt(process.env.SALT)
    );

    // Storing data in DB
    const userData = userModel({
        name: name,
        email: email,
        username: username,
        password: hashedPassword,
    })

    try {
        const userDb = await userData.save();
        return res.send({
          status: 201,
          message: "Registeration successfull",
          data: userDb,
        });
    } catch (error) {
        return res.send({
          status: 500,
          message: "Database error",
          error: error,
        });
    }
})

// LogIn
app.post('/signIn', async (req, res) => {
    const { name, password } = req.body;

    // find user in database
    try {
         let userDb = await userModel.findOne({ username: name });

        // console.log('userDb > ',userDb);
        // no user found
        if(!userDb) {
            console.log('userDb inside > ',userDb);
            return res.send({
                status: 400,
                message: "User not found, please register",
                noUser : true
            });
        }

        // hash password verify
        const isMatched = await bcrypt.compare(password, userDb.password); //it will return true/false 

        if(!isMatched) {
            return res.send({
                status: 400,
                message: "Password does not match",
                wrongPassword: true
            });
        }

         //session base auth (when login is succesfull store data in dataBase)
        req.session.isAuth = true;
        req.session.user = {
            userId: userDb._id,
            email: userDb.email,
            username: userDb.username,
        };

        // find the userData from database
        const userDataObj = await userModel.find({ name })

        return res.send({
            status: 200,
            message: "Login successful",
            loginSuccessful : true ,
            userDataObj : userDataObj
        })

    } catch (error) {
        return res.send({
            status: 500,
            message: "Database error",
            error: error,
            dataBaseError : true
        })
    }

})

// Summary
app.post('/summarize', async (req, res) => {
    console.log('summary api started')

    const { paragraph } = req.body;
    // console.log(paragraph);
    
    try {
        const summary = await summarizeParagraph(paragraph);
        res.send({ summary });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error'});
    }
});

// code
app.post('/getCode', async (req, res) => {
    console.log('code api running')
    const { language,inputedCode } = req.body;
    console.log(language,inputedCode);
    
    try {
        const codeSolution = await solution(language,inputedCode);
        res.send({ codeSolution });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
  

// chat
app.post('/saveChat', async (req,res)=>{
    try {
        const { allMessages } = req.body;
 
        // Save all messages to MongoDB
        await saveChatModel.insertMany(allMessages, { ordered: false }); //We use insertMany() to save all messages to the database. The { ordered: false } option tells MongoDB to continue inserting documents even if errors occur, allowing us to ignore duplicates.
        res.status(200).send({ message: 'Messages saved successfully' });
    } 
    catch (error) {
        /*
            In MongoDB, when you attempt to insert a document with a field value that 
            violates a unique index constraint, MongoDB will throw a duplicate key error. 
            This error has a specific error code associated with it, which is 11000. 
        */
            if (error.code === 11000) {
                console.error('Duplicate message detected:', error);
                res.status(400).send({ error: 'Duplicate message' });
            } else {
                console.error('Error saving messages:', error);
                res.status(500).send({ error: 'Internal server error' });
            }
    }
})

// chat : previous chats
app.get('/getAllChats', async (req, res) => {
    try {
        const allChats = await saveChatModel.find();
        res.status(200).send(allChats);
    } catch (error) {
        console.error('Error fetching all chats:', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});


// PDF : getSummary
app.post('/pdfSummary', async (req, res) => {
    const { pdfContent } = req.body;
    // console.log(paragraph);
    
    try {
        const summary = await summarizeParagraph(pdfContent);
        res.send({ summary });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PDF : getQuestions
app.post('/pdfQuestions', async(req,res) =>{
    const { pdfContent } = req.body;
    try {
        const allQuestions = await questions(pdfContent);
        res.send({ allQuestions });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
})

// PDF askDoubt
app.post('/askDoubt', async(req,res) =>{
    console.log('im inside ask doubt');
    const { pdfContent } = req.body;
    const { question } = req.body;
    try {
        const ansToDoubt = await pdfDoubt(pdfContent,question);
        res.send({ ansToDoubt });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
})

// IMAGE
app.post('/genImg', async(req,res)=>{
    const {  prompt } = req.body
    // console.log('prompt is : ',prompt);

    const response = await openai.images.generate({
        model: "dall-e-2",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
    });

    // image_url = response.data.data[0].url;
    console.log(response.data[0].url);


    res.send({
        myPromt : prompt,
        aiImageURL : response.data[0].url
    })
})

// LogOut
app.post("/logout", (req, res) => {
    // id = req.session.id
    // sessionModel.findOneAndDelete({_id : id})
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).send("Logout unsuccessfull");
      } else {
        return res.status(200).send({logoutSucess: true});
      }
    });
});

app.listen(PORT,()=>{
    console.log(clc.white.bgGreen.underline(`Server running on port ${PORT}`));
})
