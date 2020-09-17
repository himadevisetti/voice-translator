const ffmpeg = require('fluent-ffmpeg');
const path = require("path");
const fs = require("fs-extra");
const util = require("util");
const logger = require("./logger.js");
const { resolve } = require('path');

function getMetadata(filepath, callback) {
    // var relativefilepath = path.join(__dirname, "../", filepath);
    // ffmpeg.ffprobe(relativefilepath, function (err, metadata) {
    ffmpeg.ffprobe(filepath, function (err, metadata) {
        if (err) {
            // console.log(err);
            callback(err);
        } else {
            // var data = util.inspect(metadata);
            var data = {
                duration: metadata.format.duration,
                sampleCount: metadata.streams[0].duration_ts,
                channelCount: metadata.streams[0].channels,
                sampleRate: metadata.streams[0].sample_rate,
                format: metadata.format.format_name,
                bitRate: metadata.format.bit_rate
                // codecName: metadata.streams[0].codec_name
            };

            callback(data);
        }
    });
}

function uploadProcess(req, res, bucket, blob, mimetype, filepath, firestore) {

    global.inFile = `${blob.name}`;

    // The public URL can be used to directly access the file via HTTP.
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

    if (!req.file) {
        res.status(400).send("No file uploaded.");
        return;
    }

    // Make sure to set the contentType metadata for the browser to be able
    // to render the file instead of downloading the file (default behavior)
    const blobStream = blob.createWriteStream({
        metadata: {
            contentType: mimetype,
            metadata: {
                userName: global.username
            }
        },
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

    fs.readFile(filepath, (err, data) => {
        if (err) {
            logger.info("Error while reading the uploaded file: " + err);
            throw err;
        }
        blobStream.end(data);
    });

    var collection;
    var document;

    getMetadata(filepath, function (data) {

        var metadata = util.inspect(data);
        // console.log("Audio metadata: " + metadata);
        // var err = JSON.stringify(data).includes("sampling rate was not specified");

        // Obtain a document reference.
        collection = firestore.collection('userdata');
        var fileName = path.basename(filepath);
        // Remove file extension and store it so it could be used for deletion from firestore
        var fileExt = path.extname(fileName);
        var fileNameNoExt = path.basename(fileName, fileExt)

        var docRef; 

        async function checkIfFileExists() {

            // Check if the user has previously uploaded a file with the same name
            docRef = await collection.where('user_name', '==', global.username).where('file_name', '==', fileName).get();

            // If the user has not previously uploaded a file with this name, create a new document
            if (docRef.empty) {
                document = collection.doc();
             // console.log("Created new document with id: " + document.id);
                logger.info("Created new document with id: " + document.id);
            } else {
                // If the user has previously uploaded a file with this name, overwrite the existing document
                docRef.forEach((doc) => {                   
                    document = doc.ref; 
                 // console.log("Overwritten document with id: " + document.id);
                    logger.info("Overwritten document with id: " + document.id);
                });
            }

            if (Object.entries(data).length === 0) {
                writeToFirestoreNoHeader().catch(console.error);
            } else {
                writeToFirestore().catch(console.error);
            }
        }      

        checkIfFileExists().catch(console.error);      

        async function writeToFirestore() {

            // Enter new data into the document.
            await document.set({
                user_name: global.username,
                source_language: req.body.srclang,
                target_language: req.body.tgtlang,
                bucket_name: `${bucket.name}`,
                file_name: fileName,
                base_file_name: fileNameNoExt, 
                public_url: `${publicUrl}`,
                metadata: metadata,
                created: new Date()
            });
        }

        async function writeToFirestoreNoHeader() {

            // Enter new data into the document.
            await document.set({
                user_name: global.username,
                source_language: req.body.srclang,
                target_language: req.body.tgtlang,
                bucket_name: `${bucket.name}`,
                file_name: fileName,
                base_file_name: fileNameNoExt, 
                public_url: `${publicUrl}`,
                created: new Date()
            });
        }

        var response = {
            source_language: req.body.srclang,
            target_language: req.body.tgtlang,
            bucket_name: `${bucket.name}`,
            file_name: req.file.originalname,
            public_url: `${publicUrl}`,
            // document_id: `${document.id}`
        };
        console.log("Source Language: " + response.source_language);
        console.log("Target Language: " + response.target_language);
        console.log("Bucket Name: " + response.bucket_name);
        console.log("File Name: " + response.file_name);
        console.log("Public Url: " + response.public_url);
        logger.info("User " + global.username + " has uploaded " + global.inFile);
    });

    response = {
        source_language: req.body.srclang,
        target_language: req.body.tgtlang,
        message: "Your file is being processed"
    };
    res.status(200).send(JSON.stringify(response));

}

module.exports.getMetadata = getMetadata;
module.exports.uploadProcess = uploadProcess;