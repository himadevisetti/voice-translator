// const sox = require("sox");
const ffmpeg = require('fluent-ffmpeg');
// const util = require("util");
const path = require("path");
const fs = require("fs-extra");
const util = require("util");
const logger = require("./logger.js");

function getMetadata(filepath, callback) {
    var relativefilepath = path.join(__dirname, "../", filepath);
    ffmpeg.ffprobe(relativefilepath, function (err, metadata) {
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

// function transcodeFile(req, callback) {
//     var filepath = path.join(__dirname, "../", req.file.path);
//     const outputFileDirName = path.dirname(req.file.path);
//     const outputFileNameOldExt = path.basename(req.file.path);
//     const oldExt = path.extname(outputFileNameOldExt);
//     const outputFileNameNewExt = path.basename(outputFileNameOldExt, oldExt) + '.flac';
//     const transcodedFileName = outputFileDirName + path.sep + outputFileNameNewExt;
//     console.log("Transcoded File Name from soxUtils: " + transcodedFileName);

//     var message = "";

//     ffmpeg(filepath)
//         .toFormat('flac')
//         .on('end', () => {
//             console.log("Transcoded the uploaded file to flac format");
//             // message = outputFileNameNewExt;
//             callback(outputFileNameNewExt);
//         })
//         .on('error', (error) => {
//             console.log("Transcoding failed fue to: " + error.message);
//             // message = "Transcoding failed fue to: " + error.message;
//             callback(error.message);
//         })
//         .save(transcodedFileName);

//     // callback(message);

// }

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
            contentType: mimetype
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
        document = collection.doc();
        var fileName = path.basename(filepath);

        async function writeToFirestore() {

            // Enter new data into the document.
            await document.set({
                user_name: global.username,
                source_language: req.body.srclang,
                target_language: req.body.tgtlang,
                bucket_name: `${bucket.name}`,
                file_name: fileName,
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
                public_url: `${publicUrl}`,
                created: new Date()
            });
        }

        if (Object.entries(data).length === 0) {
            writeToFirestoreNoHeader().catch(console.error);
        } else {
            writeToFirestore().catch(console.error);
        }

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
        logger.info("User " + global.username + " has uploaded " + global.inFile + " and firestore document_id is: " + response.document_id);
    });

    response = {
        source_language: req.body.srclang,
        target_language: req.body.tgtlang,
        message: "Your file is being processed"
    };
    res.status(200).send(JSON.stringify(response));

}

module.exports.getMetadata = getMetadata;
// module.exports.transcodeFile = transcodeFile;
module.exports.uploadProcess = uploadProcess;