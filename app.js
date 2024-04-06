const express = require('express');
const cors = require('cors')
const bodyParser = require('body-parser');
require("dotenv").config();
const clc = require("cli-color");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const validator = require("validator");


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

// Variables
const app = express();
const PORT = process.env.PORT || 7000;


// Middleware
app.use(cors({
    origin: 'http://localhost:3000', // Allow requests from this origin
    credentials: true // Allow credentials (cookies, authorization headers, etc.)
}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true })); //this is used for form data
app.use(express.json()); // this is used for hitting req from anywhere like postman and converting client data to json
// CORS Middleware
const corsMiddleware = (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
};

// Apply CORS Middleware globally
app.use(corsMiddleware);


// Databse Connection
mongoose.connect(process.env.URI)
 .then(() => console.log(clc.white.bgGreen.underline("Connected to Database")))
 .catch((err) => console.log(clc.bgRed(err)));


//  API's:
 app.get('/', function (req, res) {
    res.send('Welcome to the world of ai')
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

app.listen(PORT,()=>{
    console.log(clc.white.bgGreen.underline(`Server running on port ${PORT}`));
})
