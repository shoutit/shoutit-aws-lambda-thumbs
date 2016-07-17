/**
 * User: mo
 * Date: 16/07/16
 * Time: 18:10
 */

var async = require('async'),
    path = require('path'),
    fs = require('fs'),
    index = require('./index');

function localTest() {
    "use strict";
    var srcKey = 'da72dee5-9a93-4bd7-a413-bfd44e8c5a2d-1468749681.jpg',
        srcBucket = 'shoutit-shout-image-original',
        srcExtName = path.extname(srcKey),
        shoutitWaterfall = [
            function (next) {
                index.s3.getObject({Bucket: srcBucket, Key: srcKey}, next);
            },
            index.genTransform(srcExtName, 720, 720, true),
            // genCompress(srcExtName),  // doesn't work on windows
            function (data, response, next) {
                fs.writeFile('out.jpg', data, 'binary', next);
            }
        ];
    async.waterfall(shoutitWaterfall,
        function (err) {
            if (err) console.log('Unable to create thumbnail due to an error: ' + err);
            else console.log('Successfully created thumbnail');
            process.exit();
        }
    );
}
localTest();
