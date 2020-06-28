const cookieParser = require("cookie-parser");
const csrf = require("csurf");
const bodyParser = require("body-parser");
const express = require("express");
const admin = require("firebase-admin");
const Multer = require("multer");
const {Storage} = require("@google-cloud/storage");
const path = require("path");
const firebase = require("firebase");

// Add the Firebase products
require("firebase/firestore");

const {Firestore} = require('@google-cloud/firestore');

// Load environment variables
const dotenv = require('dotenv');
dotenv.config();

// Instantiate a storage client
const googleCloudStorage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  keyFilename: process.env.GCLOUD_KEY_FILE
});

// Create a new firestore client
const firestore = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    keyFilename: process.env.GCLOUD_KEY_FILE
});

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://teak-mantis-279104.firebaseio.com"
});

const csrfMiddleware = csrf({ cookie: true });

const PORT = process.env.PORT || 3000;
const app = express();

app.engine("html", require("ejs").renderFile);
app.use(express.static("static"));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(csrfMiddleware);

// Multer is required to process file uploads and make them available via
// req.files.
const multer = Multer({
  storage: Multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // no larger than 5mb, you can change as needed
  }
});

// A bucket is a container for objects (files).
const bucket = googleCloudStorage.bucket(process.env.GCLOUD_STORAGE_BUCKET);

app.all("*", (req, res, next) => {
  res.cookie("XSRF-TOKEN", req.csrfToken());
  next();
});

app.get("/login", function (req, res) {
  res.render("login.html");
});

app.get("/signup", function (req, res) {
  res.render("signup.html");
});

app.get("/home", function (req, res) {
  const sessionCookie = req.cookies.session || "";

  admin
    .auth()
    .verifySessionCookie(sessionCookie, true /** checkRevoked */)
    .then(() => {
      res.render("landing.html");
    })
    .catch((error) => {
      res.redirect("/login");
    });
});

app.get("/landing", function (req, res) {
  const sessionCookie = req.cookies.session || "";

  admin
    .auth()
    .verifySessionCookie(sessionCookie, true /** checkRevoked */)
    .then(() => {
      res.render("landing.html");
    })
    .catch((error) => {
      res.redirect("/login");
    });
});

app.get("/translate", function (req, res) {
  const sessionCookie = req.cookies.session || "";

  admin
    .auth()
    .verifySessionCookie(sessionCookie, true /** checkRevoked */)
    .then(() => {
      res.render("upload.html");
    })
    .catch((error) => {
      res.redirect("/login");
    });
});

app.get("/viewstatus", function (req, res) {
  const sessionCookie = req.cookies.session || "";

  admin
    .auth()
    .verifySessionCookie(sessionCookie, true /** checkRevoked */)
    .then(() => {
      res.render("viewstatus.html");
    })
    .catch((error) => {
      res.redirect("/login");
    });
});

// Process the file upload and upload to Google Cloud Storage.
app.post("/upload", multer.single("file"), (req, res, next) => {
  const sessionCookie = req.cookies.session || "";

  admin
    .auth()
    .verifySessionCookie(sessionCookie, true /** checkRevoked */)
    .then(() => {
      // Create a new blob in the bucket and upload the file data.
      const blob = bucket.file(req.body.fileName);

      // The public URL can be used to directly access the file via HTTP.
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`; 

      if (!req.body.myFile) {
        res.status(400).send("No file uploaded.");
        return;
      }

      // Make sure to set the contentType metadata for the browser to be able
      // to render the file instead of downloading the file (default behavior)
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: req.body.fileType
        }
      });

      blobStream.on("error", err => {
        next(err);
        return;
      });

      blobStream.on("finish", () => {
        // The public URL can be used to directly access the file via HTTP.
        // const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        blob.makePublic(); 
      });

      blobStream.end(req.body.myFile.buffer);

      var collection; 
      var document; 
      
      async function writeToFirestore() {

        // Obtain a document reference.
        collection = firestore.collection('userdata');
        document = collection.doc();

        // Enter new data into the document.
        await document.set({
          source_language: req.body.srclang,
          target_language: req.body.tgtlang,
          bucket_name: `${bucket.name}`,
          file_name: req.body.fileName,
          public_url: `${publicUrl}`
        });

      }

      writeToFirestore().catch(console.error);

      var response = {
        source_language:req.body.srclang,
        target_language:req.body.tgtlang,
        bucket_name:`${bucket.name}`,
        file_name:req.body.fileName,
        public_url:`${publicUrl}`,
        document_id: `${document.id}`
      };
      console.log("Source Language: " + response.source_language); 
      console.log("Target Language: " + response.target_language);
      console.log("Bucket Name: " + response.bucket_name); 
      console.log("File Name: " + response.file_name);
      console.log("Public Url: " + response.public_url); 
      console.log('Document Id:', response.document_id);

      response = {
        source_language:req.body.srclang,
        target_language:req.body.tgtlang,
        message:`Success! File uploaded to ${publicUrl} and database updated with ${document.id}`
      };
      res.end(JSON.stringify(response));
    })
    .catch((error) => {
      res.redirect("/login");
    });
});

app.get("/", function (req, res) {
  res.render("index.html");
});

app.post("/sessionLogin", (req, res) => {
  const idToken = req.body.idToken.toString();

  const expiresIn = 60 * 60 * 24 * 5 * 1000;

  admin
    .auth()
    .createSessionCookie(idToken, { expiresIn })
    .then(
      (sessionCookie) => {
        const options = { maxAge: expiresIn, httpOnly: true };
        res.cookie("session", sessionCookie, options);
        res.end(JSON.stringify({ status: "success" }));
      },
      (error) => {
        res.status(401).send("UNAUTHORIZED REQUEST!");
      }
    );
});

app.get("/sessionLogout", (req, res) => {
  res.clearCookie("session");
  res.redirect("/login");
});

var server = app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});

const io = require('socket.io')(server);
io.on('connection', (socketServer) => {
  socketServer.on('npmStop', () => {
    process.exit(0);
  });
});

