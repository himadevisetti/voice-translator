const sox = require("sox");
const util = require("util");
const path = require("path"); 

function getMetadata(req, callback) {
    var filepath = path.join(__dirname, "../", req.file.path); 
    sox.identify(filepath, function (err, metadata) {
        if (err) {
            // console.log(err); 
            callback(err);
        } else {
            data = util.inspect(metadata);
            callback(data);
        }        
    });
}

module.exports.getMetadata = getMetadata;