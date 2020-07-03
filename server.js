const cookieParser = require("cookie-parser");
const csrf = require("csurf");
const bodyParser = require("body-parser");
const express = require("express");
const admin = require("firebase-admin");
const Multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const firebase = require("firebase");

// Add the Firebase products
require("firebase/firestore");

const { Firestore } = require('@google-cloud/firestore');

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

// app.engine("html", require("ejs").renderFile);

// set the view engine to ejs
app.set('view engine', 'ejs');
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

// upload bucket
const bucket = googleCloudStorage.bucket(process.env.GCLOUD_STORAGE_BUCKET);

// download bucket
const outBucket = googleCloudStorage.bucket(process.env.GCLOUD_STORAGE_OUTPUT_BUCKET);

// logged in user
global.username;

// upload fileName
global.inFile;

var viewstatusHtml = "views/viewstatus.html";

app.all("*", (req, res, next) => {
  res.cookie("XSRF-TOKEN", req.csrfToken());
  next();
});

app.get("/", function (req, res) {
  res.render("index");
});

app.get("/login", function (req, res) {
  res.render("login");
});

app.get("/signup", function (req, res) {
  res.render("signup");
});

app.get("/home", function (req, res) {
  const sessionCookie = req.cookies.session || "";

  admin
    .auth()
    .verifySessionCookie(sessionCookie, true /** checkRevoked */)
    .then(() => {
      res.render("home");
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
      res.render("landing");
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
      res.render("upload");
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
      // download bucket
      const outBucketName = `${outBucket.name}`;
      // download fileName
      const outBlob = "Translated_" + path.parse(global.inFile).name + ".mp3";

      const publicOutputUrl = `https://storage.cloud.google.com/${outBucket.name}/${outBlob}`;
      console.log("Output file url: " + publicOutputUrl);

      checkStatus(outBucketName, outBlob);
      // replace id of the anchor tag to display a link to translated file
      res.render('viewstatus', { translatedFile: publicOutputUrl });
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
      blob = bucket.file(req.file.originalname);
      global.inFile = `${blob.name}`;

      // The public URL can be used to directly access the file via HTTP.
      const publicUrl = `https://storage.cloud.google.com/${bucket.name}/${blob.name}`;

      if (!req.file) {
        res.status(400).send("No file uploaded.");
        return;
      }

      // Make sure to set the contentType metadata for the browser to be able
      // to render the file instead of downloading the file (default behavior)
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: req.file.mimetype
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

      blobStream.end(req.file.buffer);

      var collection;
      var document;

      async function writeToFirestore() {

        // Obtain a document reference.
        collection = firestore.collection('userdata');
        document = collection.doc();
        // const timestamp = admin.firestore.Timestamp.fromDate(new Date()); 

        // Enter new data into the document.
        await document.set({
          user_name: global.username,
          source_language: req.body.srclang,
          target_language: req.body.tgtlang,
          bucket_name: `${bucket.name}`,
          file_name: req.file.originalname,
          public_url: `${publicUrl}`,
          created: new Date()
        });

      }

      writeToFirestore().catch(console.error);

      var response = {
        source_language: req.body.srclang,
        target_language: req.body.tgtlang,
        bucket_name: `${bucket.name}`,
        file_name: req.file.originalname,
        public_url: `${publicUrl}`,
        document_id: `${document.id}`
      };
      console.log("Source Language: " + response.source_language);
      console.log("Target Language: " + response.target_language);
      console.log("Bucket Name: " + response.bucket_name);
      console.log("File Name: " + response.file_name);
      console.log("Public Url: " + response.public_url);
      console.log('Document Id:', response.document_id);

      response = {
        source_language: req.body.srclang,
        target_language: req.body.tgtlang,
        message: `Success! File uploaded to ${publicUrl} and database updated with ${document.id}`
      };
      res.end(JSON.stringify(response));
    })
    .catch((error) => {
      res.redirect("/login");
    });
});

app.post("/sessionLogin", (req, res) => {
  const idToken = req.body.idToken.toString();
  global.username = req.body.login.toString();
  console.log("Logged in as: " + global.username);

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

async function checkStatus(bucketName, fileName) {
  console.log("Checking status");
  var file = googleCloudStorage.bucket(bucketName).file(fileName);
  file.exists()
    .then(exists => {
      console.log("exists?: " + exists);
      console.log("typeof exists: " + typeof exists);
      console.log("exists[0]?: " + exists[0]);
      if (exists[0] === true) {
        console.log("File exists in the bucket: " + exists);
      } else {
        waitForFile(bucketName, fileName);
      }
    })
    .catch(err => {
      console.log("File cannot be accessed: " + err.message);
      return err;
    })
}

async function waitForFile(bucketName, fileName) {
  let fileReady = null;
  let fileExists = false;
  var keepGoing = true;
  while (fileExists === false && keepGoing === true) {
    // while(fileExists === false) {
    console.log("Waiting for file");
    const MAX_RETRIES = 2;
    for (let i = 0; i <= MAX_RETRIES; i++) {
      await wait(10000);
    }
    fileReady = googleCloudStorage.bucket(bucketName).file(fileName);
    fileReady.exists().then((fileProcessed) => {
      console.log("File processing completed: " + fileProcessed[0]);
      fileExists = fileProcessed[0];
    })
      .catch(err => {
        console.log("File could not be processed: " + err.message);
        return err;
      })
    setTimeout(function () {
      // causing the following while loop to exit
      keepGoing = false;
    }, 30000); // 0.5 minute in milliseconds 
  }
  return fileExists;
}

function wait(timeout) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, timeout);
  });
}

