const cookieParser = require("cookie-parser");
const csrf = require("csurf");
const bodyParser = require("body-parser");
const express = require("express");
const admin = require("firebase-admin");
const Multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const fs = require("fs-extra");
const logger = require("./utils/logger.js");
const soxUtils = require("./utils/sox-utils.js");
const ffmpeg = require('fluent-ffmpeg');
const os = require("os");

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
const { resolve } = require("path");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://teak-mantis-279104.firebaseio.com"
});

const csrfMiddleware = csrf({ cookie: true });
var csrfEnabled = true;

var customCsrf = function (req, res, next) {
  // Whitelist ios APIs so as to bypass CSRF validation
  var whiteList = new Array("/ios-upload", "/ios-viewstatus", "/ios-checkstatus", "/ios-deletefile");
  if (whiteList.indexOf(req.path) != -1) {
    csrfEnabled = false;
  }

  if (csrfEnabled) {
    csrfMiddleware(req, res, next);
  } else {
    next();
  }
}

const PORT = process.env.PORT || 8080;
const app = express();

// app.engine("html", require("ejs").renderFile);

// set the view engine to ejs
app.set('view engine', 'ejs');
app.use(express.static("static"));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
// app.use(csrfMiddleware);
app.use(customCsrf);

var tempDir = os.tmpdir();
var tempUploadDir = tempDir + '/uploads';
console.log("Temp directory location on the host " + os.hostname() + " is: " + tempUploadDir);

const multer = Multer({
  // storage: Multer.memoryStorage()
  storage: Multer.diskStorage({
    destination: function (req, file, cb) {
      var filepath = tempUploadDir;
      fs.mkdirsSync(filepath);
      cb(null, filepath);
    },

    // By default, multer removes file extensions so let's add them back
    filename: function (req, file, cb) {
      // cb(null, file.fieldname + '-' + Date.now() + filepath.extname(file.originalname));
      cb(null, file.originalname);
    }
  }),
  limits: {
    fileSize: 1000 * 1024 * 1024 // no larger than 1gb, change as needed
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

app.all("*", (req, res, next) => {
  // console.log("CSRF enabled flag: " + csrfEnabled);
  if (csrfEnabled) {
    res.cookie("XSRF-TOKEN", req.csrfToken());
    next();
  } else {
    next();
  }
});

app.get("/", function (req, res) {
  // res.render("index");
  res.render("login");
});

app.get("/home", function (req, res) {
  res.render("home");
});

app.get("/error", function (req, res) {
  res.render("error");
});

app.get("/login", function (req, res) {
  res.render("login");
});

app.get("/signup", function (req, res) {
  res.render("signup", { headerText: "Register" });
});

app.get("/forgotPassword", function (req, res) {
  res.render("forgotpassword", { headerText: "Reset password" });
});

app.get("/passwordReset", function (req, res) {
  res.render("passwordreset");
});

app.get("/landing", function (req, res) {
  const sessionCookie = req.cookies.session || "";

  admin
    .auth()
    .verifySessionCookie(sessionCookie, true /** checkRevoked */)
    .then(() => {
      res.render("landing", { errorMessage: "" });
    })
    .catch((error) => {
      logger.info("Could not render landing page due to " + error);
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
      logger.info("Could not render upload page due to " + error);
      res.redirect("/login");
    });
});

app.get("/viewstatus", function (req, res) {
  const sessionCookie = req.cookies.session || "";
  admin
    .auth()
    .verifySessionCookie(sessionCookie, true /** checkRevoked */)
    .then(() => {
      // console.log("File name uploaded for processing: " + global.inFile);
      logger.info("User " + global.username + " uploaded the file " + global.inFile);
      // 2 minutes timeout just for GET to viewstatus endpoint
      req.socket.setTimeout(2 * 60 * 1000);
      // download bucket
      const outBucketName = `${outBucket.name}`;
      // download fileName
      // const outBlob = "Translated_" + path.parse(global.inFile).name + ".mp3";
      const outBlob = path.parse(global.inFile).name + ".mp3";
      console.log("Output file name is: " + outBlob);

      var publicOutputUrl = "";
      checkFileProcessingStatus(outBucketName, outBlob).then(fileAvailable => {
        console.log("File processing completed?: " + fileAvailable);
        if (fileAvailable === true) {
          publicOutputUrl = `https://storage.googleapis.com/${outBucket.name}/${outBlob}`;
          console.log("publicOutputUrl: " + publicOutputUrl);
        } else {
          publicOutputUrl = "Your file is currently being processed. Please check status after a few minutes from Home screen";
        }
      })

      if (publicOutputUrl === "") {
        publicOutputUrl = "Your file is currently being processed. Please check status after a few minutes from Home screen";
      }
      console.log("File processing status:" + publicOutputUrl);
      // replace id of the anchor tag to display a link to translated file
      res.render('viewstatus', { translatedFile: publicOutputUrl });
    })
    .catch((error) => {
      logger.info("Could not render viewstatus page due to " + error);
      res.redirect("/login");
    });
});

app.get("/ios-viewstatus", function (req, res) {
  global.username = req.query.username;
  console.log("Logged in as: " + global.username);
  global.inFile = req.query.filename;
  // console.log("File name uploaded for processing: " + global.inFile);
  logger.info("User " + global.username + " uploaded the file " + global.inFile);
  // 2 minutes timeout just for GET to viewstatus endpoint
  req.socket.setTimeout(2 * 60 * 1000);
  // download bucket
  const outBucketName = `${outBucket.name}`;
  // download fileName
  // const outBlob = "Translated_" + path.parse(global.inFile).name + ".mp3";
  const outBlob = path.parse(global.inFile).name + ".mp3";
  console.log("Output file name is: " + outBlob);

  var publicOutputUrl = "";
  checkFileProcessingStatus(outBucketName, outBlob).then(fileAvailable => {
    console.log("File processing completed?: " + fileAvailable);
    if (fileAvailable === true) {
      publicOutputUrl = `https://storage.googleapis.com/${outBucket.name}/${outBlob}`;
      console.log("publicOutputUrl: " + publicOutputUrl);
    } else {
      publicOutputUrl = "Your file is currently being processed. Please check status after a few minutes from Profile page";
    }
    res.status(200).send(JSON.stringify(publicOutputUrl));
  })
});

app.get("/checkstatus", function (req, res) {
  const sessionCookie = req.cookies.session || "";
  admin
    .auth()
    .verifySessionCookie(sessionCookie, true /** checkRevoked */)
    .then(() => {
      logger.info("User " + global.username + " checked the status");
      fetchResultFromDB().then(status => {
        if (status.includes("No files")) {
          res.render("landing", { errorMessage: "No files were submitted for translation. Please upload a file by clicking translate button. In case you have just submitted a file, please give it a few minutes" });
        } else {
          // replace id of the div tag to display status of files previously submitted by this user
          console.log("Files returned from DB: " + status);
          res.render('checkstatus', { statusUpdate: status.trim().split("\n") });
        }
      })
        .catch(err => {
          // console.log("No result returned from DB: " + err.message);
          logger.info("No result returned from DB: " + err.message);
          return err;
        })
      // replace id of the div tag to display status of files previously submitted by this user
      // res.render('checkstatus', { statusUpdate: status });
    })
    .catch((error) => {
      logger.info("Could not render checkstatus page due to " + error);
      res.redirect("/login");
    });
});

app.get("/ios-checkstatus", function (req, res) {
  global.username = req.query.username;
  console.log("Logged in as: " + global.username);
  logger.info("User " + global.username + " checked the status");
  var filesReturned = "";
  fetchResultFromDB().then(status => {
    if (status.includes("No files")) {
      filesReturned = "No files were submitted for translation. Please upload a file by clicking translate button. In case you have just submitted a file, please give it a few minutes";
    } else {
      // status of upto 5 files previously submitted by this user each one on a new line
      console.log("Files returned from DB: " + status);
      filesReturned = status.trim().split("\n");
    }
    res.status(200).send(JSON.stringify(filesReturned));
  })
    .catch(err => {
      filesReturned = "No result returned from DB: " + err.message;
      // console.log("No result returned from DB: " + err.message);
      logger.info("No result returned from DB: " + err.message);
      return err;
    })
});

function fetchResultFromDB() {
  return new Promise((resolve, reject) => {
    console.log("username = " + global.username);
    // download bucket
    const outBucketName = `${outBucket.name}`;
    const collection = firestore.collection('userdata');
    var status = "";
    // query the collection to fetch upto 5 files previously submitted by this user
    collection.where('user_name', '==', `${global.username}`).orderBy('created', 'desc').limit(5).get().then(snap => {
      size = snap.size;
      logger.info("Count of records for user " + global.username + " is: " + size);
      if (snap.empty) {
        status = "No files were submitted for translation. Please upload file by clicking translate button";
        // status = "";
        resolve(status);
        // res.render("landing", { errorMessage: "No files were submitted for translation. Please upload file by clicking translate button" });
      }

      var count = 0;
      snap.forEach(doc => {
        // fetch file name from db record
        const fileName = doc.data().file_name;
        logger.info(`${global.username}` + " previously submitted file: " + fileName);
        // download fileName
        // const outBlob = "Translated_" + path.parse(fileName).name + ".mp3";
        const outBlob = path.parse(fileName).name + ".mp3";
        const translatedFileAvailable = checkFileProcessingStatus(outBucketName, outBlob).then(fileAvailable => {
          count++;
          if (fileAvailable === true) {
            const publicOutputUrl = `https://storage.googleapis.com/${outBucket.name}/${outBlob}`;
            status += "\n" + publicOutputUrl;
          } else {
            const fileExt = path.extname(fileName);
            const fileNameNoExt = path.basename(fileName, fileExt)
            status += "\n" + fileNameNoExt + " is still under processing. Please check after a few minutes";
          }
          if (count === size) {
            resolve(status);
          }
        });
      });
    })
      .catch(err => {
        // console.log("DB Error: " + err.message);
        logger.info("DB Error: " + err.message);
        reject(err);
      })
  })
}

app.delete("/ios-deletefile", function (req, res) {

  const userName = req.query.username;

  // Input urlString is in the format https://storage.cloud.google.com/cool_place/commercial_stereo.mp3 
  const urlString = req.query.urlstring;
  const urlArray = urlString.split("/");
  const urlArrayLength = urlArray.length;
  const fileName = urlArray[urlArrayLength - 1];
  const bucketName = urlArray[urlArrayLength - 2];

  // console.log("File " + fileName + " will be deleted from the bucket " + bucketName + " for user " + userName);
  logger.info("File " + fileName + " will be deleted from the bucket " + bucketName + " for user " + userName);

  // Remove file extension as it could be stored with a different extension in firestore; Use this only for firestore query below
  const fileExt = path.extname(fileName);
  const fileNameNoExt = path.basename(fileName, fileExt)

  async function deleteFile() {

    // Delete file from the bucket
    await googleCloudStorage.bucket(bucketName).file(fileName).delete();
    console.log(`gs://${bucketName}/${fileName} deleted.`);

    // Delete record from firestore
    const collection = firestore.collection('userdata');
    // var deleteQuery = collection.where('base_file_name', '==', fileNameNoExt).where('bucket_name', '==', bucketName).where('user_name', '==', userName);
    var deleteQuery = collection.where('base_file_name', '==', fileNameNoExt).where('user_name', '==', userName);

    deleteQuery.get().then((querySnapshot) => {
      logger.info(`Received query snapshot of size ${querySnapshot.size}`);
      querySnapshot.forEach((doc) => {
        doc.ref.delete().then(() => {
          console.log("Document successfully deleted!");
        }).catch(function (error) {
          console.error("Error removing document: " + error);
        });
      });
    })
      .catch(function (error) {
        console.log("Error getting documents: ", error);
      });

  }

  const success = deleteFile().catch(console.error);

  if (success) {
    res.status(204).end();
  } else {
    res.status(404).end();
  }

});

// Process the file upload and upload to Google Cloud Storage.
app.post("/upload", multer.single("file"), (req, res, next) => {
  const sessionCookie = req.cookies.session || "";

  admin
    .auth()
    .verifySessionCookie(sessionCookie, true /** checkRevoked */)
    .then(() => {
      // 10 minutes timeout just for POST to upload endpoint
      req.socket.setTimeout(10 * 60 * 1000);

      const fileExt = path.extname(req.file.path);

      var allowedFileTypes = ['.amr', '.3ga', '.3gp', '.3g2', '.awb', '.flac', '.wav', '.raw', '.opus', '.ogg', '.oga', '.spx'];

      var blob = "";
      var mimetype = "";

      if (allowedFileTypes.includes(fileExt)) {

        // console.log("This file does not need to be transcoded");
        logger.info("This file does not need to be transcoded");
        // Create a new blob in the bucket and upload the file data.
        blob = bucket.file(req.file.originalname);
        mimetype = req.file.mimetype;
        originalFilePath = req.file.path;
        console.log("originalFilePath is: " + originalFilePath);
        soxUtils.uploadProcess(req, res, bucket, blob, mimetype, originalFilePath, firestore);

      } else {

        console.log("This file needs to be transcoded");
        const outputFileDirName = path.dirname(req.file.path);
        const outputFileNameOldExt = path.basename(req.file.path);
        const oldExt = path.extname(outputFileNameOldExt);
        const transcodedFileName = path.basename(outputFileNameOldExt, oldExt) + '.flac';
        const transcodedFilePath = outputFileDirName + path.sep + transcodedFileName;
        // console.log("transcodedFilePath is: " + transcodedFilePath);
        // console.log("Transcoded File Name: " + transcodedFileName);
        logger.info("Transcoded File Name: " + transcodedFileName);

        ffmpeg(req.file.path)
          .toFormat('flac')
          .on('end', () => {
            console.log("Completed transcoding process");
            blob = bucket.file(transcodedFileName);
            mimetype = "audio/x-flac";
            soxUtils.uploadProcess(req, res, bucket, blob, mimetype, transcodedFilePath, firestore);
          })
          .on('error', (error) => {
            console.log("Transcoding failed fue to: " + error.message);
          })
          .save(transcodedFilePath);

      }
    })
    .catch((error) => {
      console.log("From upload endpoint " + error);
      logger.info("From upload endpoint " + error);
      res.redirect("/login");
    });
});


// Process the file upload and upload to Google Cloud Storage.
app.post("/ios-upload", multer.single("file"), (req, res, next) => {

  global.username = req.body.username;
  // console.log("Logged in as: " + global.username);
  logger.info("Logged in as: " + global.username);

  req.socket.setTimeout(10 * 60 * 1000);

  const fileExt = path.extname(req.file.path);

  var allowedFileTypes = ['.amr', '.3ga', '.3gp', '.3g2', '.awb', '.flac', '.wav', '.raw', '.opus', '.ogg', '.oga', '.spx'];

  var blob = "";
  var mimetype = "";

  if (allowedFileTypes.includes(fileExt)) {

    // console.log("This file does not need to be transcoded");
    logger.info("This file does not need to be transcoded");
    // Create a new blob in the bucket and upload the file data.
    blob = bucket.file(req.file.originalname);
    mimetype = req.file.mimetype;
    originalFilePath = req.file.path;
    console.log("originalFilePath is: " + originalFilePath);
    soxUtils.uploadProcess(req, res, bucket, blob, mimetype, originalFilePath, firestore);

  } else {

    console.log("This file needs to be transcoded");
    const outputFileDirName = path.dirname(req.file.path);
    const outputFileNameOldExt = path.basename(req.file.path);
    const oldExt = path.extname(outputFileNameOldExt);
    const transcodedFileName = path.basename(outputFileNameOldExt, oldExt) + '.flac';
    const transcodedFilePath = outputFileDirName + path.sep + transcodedFileName;
    // console.log("transcodedFilePath is: " + transcodedFilePath);
    // console.log("Transcoded File Name: " + transcodedFileName);
    logger.info("Transcoded File Name: " + transcodedFileName);

    ffmpeg(req.file.path)
      .toFormat('flac')
      .on('end', () => {
        console.log("Completed transcoding process");
        blob = bucket.file(transcodedFileName);
        mimetype = "audio/x-flac";
        soxUtils.uploadProcess(req, res, bucket, blob, mimetype, transcodedFilePath, firestore);
      })
      .on('error', (error) => {
        console.log("Transcoding failed fue to: " + error.message);
      })
      .save(transcodedFilePath);

  }

});


app.post("/sessionLogin", (req, res) => {
  const idToken = req.body.idToken.toString();
  global.username = req.body.login.toString();
  // console.log("Logged in as: " + global.username);
  logger.info("Logged in as: " + global.username);

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
        logger.info("From login endpoint " + error);
        res.status(401).send("UNAUTHORIZED REQUEST!");
      }
    );
});

app.get("/sessionLogout", (req, res) => {
  res.clearCookie("session");
  res.redirect("/login");
});

var server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

const io = require('socket.io')(server);
io.on('connection', (socketServer) => {
  socketServer.on('npmStop', () => {
    process.exit(0);
  });
});

app.post("/updatePassword", (req, res) => {
  global.username = req.body.login.toString();
  // console.log("Logged in as: " + global.username);
  logger.info("Logged in as: " + global.username);
  const pwd = req.body.password.toString();

  admin.auth().getUserByEmail(global.username)
    .then(function (userRecord) {

      var uid = userRecord.uid;
      // See the UserRecord reference doc for the contents of userRecord.
      // console.log('Successfully fetched user data: ' + uid);

      admin.auth().updateUser(uid, {
        password: pwd,
      })
        .then(function (userRecord) {
          console.log('Successfully updated password for user: ' + JSON.stringify(userRecord.email));
        })
        .catch(function (error) {
          console.log("Error occured during password reset. " + error);
        });
      res.status(200).send("Password was updated successfully.");
    })
    .catch(function (error) {
      console.log("Error fetching user data: " + error);
    });

});

function checkFileProcessingStatus(bucketName, fileName) {
  return new Promise((resolve, reject) => {
    console.log("Checking status");
    var file = googleCloudStorage.bucket(bucketName).file(fileName);
    file.exists()
      .then(exists => {
        if (exists[0] === true) {
          resolve(exists[0]);
        } else {
          const fileStatus = waitForFile(bucketName, fileName).then(fStatus => {
            resolve(fStatus);
          });
        }
      })
      .catch(err => {
        // console.log("File cannot be accessed: " + err.message);
        logger.info("File cannot be accessed: " + err.message);
        reject(err);
      })
  })
}

async function waitForFile(bucketName, fileName) {
  let fileReady = null;
  let fileExists = false;
  const MAX_RETRIES = 2;
  let retryCount = 0;
  // var keepGoing = true;
  // while (fileExists === false && keepGoing === true) {
  while (fileExists === false && retryCount < MAX_RETRIES) {
    retryCount++;
    console.log("Waiting for file");
    // for (let i = 0; i <= MAX_RETRIES; i++) {
    //   await wait(1000);
    // }
    await wait(1000);
    fileReady = googleCloudStorage.bucket(bucketName).file(fileName);
    fileReady.exists().then((fileProcessed) => {
      // console.log("File processing completed: " + fileProcessed[0]);
      logger.info("File processing completed: " + fileProcessed[0]);
      fileExists = fileProcessed[0];
    })
      .catch(err => {
        // console.log("File could not be processed: " + err.message);
        logger.info("File could not be processed: " + err.message);
        return err;
      })
    // setTimeout(function () {
    //   // causing the following while loop to exit
    //   keepGoing = false;
    // }, 30000); // 0.5 minute in milliseconds 
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

// Delete files in /tmp folder on the host that are older than 1 hour
app.get("/deleteuploadshourly", function (req, res) {

  if (req.get('X-Appengine-Cron') === 'true' || global.username === 'voice_translator@yahoo.com') {

    logger.info("This user or process is authorized to perform this action");

    var uploadsDir = os.tmpdir() + '/uploads';
    // logger.info("Uploads directory: " + uploadsDir);

    // List files in a directory. Delete this code after a few iterations
    fs.readdir(uploadsDir, function (err, files) {
      if (err) {
        console.log("Error getting directory information " + err);
      } else {
        files.forEach(function (file) {
          console.log(file);
        })
      }
    });

    // Delete files older than 1 hour
    var findRemoveSync = require('find-remove');
    findRemoveSync(uploadsDir, { files: '*.*', age: { seconds: 3600 } });

    // Send success response
    res.status(200).send("Uploads folder has been cleaned up!");

  } else {

    logger.info("This user or process is not authorized to perform this action");
    res.status(401).send("This user or process is not authorized to perform this action");

  }
});

function deleteAnonymousUsers(nextPageToken) {

  // Anonymous users are used for token generation
  // Tokens expire in 8 hours
  // Delete anonymous users created before 9 hours (cutoff time)
  const timeNowinMillis = Date.now();
  const cutoffTime = Math.floor(timeNowinMillis / 1000) - (9 * 60 * 60);
  // console.log(cutoffTime);

  admin
    .auth()
    .listUsers(20, nextPageToken)
    .then(function (listUsersResult) {
      listUsersResult.users.forEach(function (userRecord) {

        var creationTime = userRecord.metadata.creationTime;
        var creationTimeUnixTime = Math.floor(new Date(creationTime).getTime() / 1000);
        //  console.log(creationTimeUnixTime);

        // provider data is empty for anonymous users
        if (userRecord.providerData.length === 0 && creationTimeUnixTime < cutoffTime) {
          // console.log(userRecord); // do the delete here
          admin.auth().deleteUser(userRecord.uid)
            .then(function () {
              console.log("Successfully deleted user: ", userRecord.uid);
            })
            .catch(function (error) {
              console.log("Error deleting user: ", error);
            });
        }
      });
      if (listUsersResult.pageToken) {
        // List next batch of users.
        deleteAnonymousUsers(listUsersResult.pageToken);
      }
    })
    .catch(function (error) {
      console.log('Error listing users:', error);
      logger.info('Error listing users:', error);
    });
}

// Delete anonymous users used for token generation
app.get("/deletetokenusers", function (req, res) {

  if (req.get('X-Appengine-Cron') === 'true' || global.username === 'voice_translator@yahoo.com') {

    logger.info("This user or process is authorized to perform this action");
    deleteAnonymousUsers();

    // Send success response
    res.status(200).send("Anonymous users were deleted successfully!");

  } else {

    logger.info("This user or process is not authorized to perform this action");

    // Send error response
    res.status(401).send("This user or process is not authorized to perform this action");

  }

});

app.get("/deleteuploads", function (req, res) {

  if (req.get('X-Appengine-Cron') === 'true' || global.username === 'voice_translator@yahoo.com') {

    logger.info("This user or process is authorized to perform this action");

    // Get today's date
    const today = new Date();

    // Get yesterday's date
    var yesterday = new Date(today); // Today!
    yesterday.setDate(yesterday.getDate() - 1); // Yesterday! Sun Aug 02 2020
    yesterday = yesterday.toDateString().split(' '); // ["Sun","Aug","02","2020"]
    yesterday = yesterday[2] + yesterday[1] + yesterday[3]; // 02Aug2020

    // Get day before yesterday's date
    var daybefore = new Date(today); // Today!
    daybefore.setDate(daybefore.getDate() - 2); // DayBeforeYesterday! Sat Aug 01 2020
    daybefore = daybefore.toDateString().split(' '); // ["Sat","Aug","01","2020"]
    daybefore = daybefore[2] + daybefore[1] + daybefore[3]; // 01Aug2020

    // Declare and initialize variables to hold directory names
    var latestuploads = path.join(__dirname, "/uploads_" + yesterday);
    var previousuploads = path.join(__dirname, "/uploads_" + daybefore);
    var currentuploads = path.join(__dirname, "/uploads");

    const desiredMode = 0o2775;

    // Create an uploads directory to backup yesterday's uploads
    fs.ensureDirSync(latestuploads, desiredMode);

    // Backup all the files from uploads directory to yesterday's uploads directory
    fs.copySync(currentuploads, latestuploads);

    // Empty current directory
    fs.emptyDirSync(currentuploads);

    // Delete day before yesterday's directory
    fs.removeSync(previousuploads);

    // Send success response
    res.status(200).send("Uploads folder has been cleaned up!");

  } else {

    logger.info("This user or process is not authorized to perform this action");
    res.status(401).send("This user or process is not authorized to perform this action");

  }
});

// Get users count
app.get("/getuserscount", function (req, res) {

  firestore.collection('users').get().then(snap => {
    userCount = snap.size // will return the collection size
    // Send success response
    res.status(200).send("Current users count: " + userCount);
  });

});
