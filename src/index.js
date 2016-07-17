/**
 * User: mo
 * Date: 16/07/16
 * Time: 18:10
 */

var async = require('async'),
    AWS = require('aws-sdk'),
    gm = require('gm').subClass({imageMagick: true}), // Enable ImageMagick integration.
    util = require('util'),
    path = require('path'),
    Imagemin = require('imagemin'),
    s3 = new AWS.S3(),
    VARIATIONS = {
        large: [720, 720, true],
        medium: [480, 480, false],
        small: [240, 240, false]
    };


function handler(event, context) {
    "use strict";
    // Read options from the event.
    console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
    var srcBucket = event.Records[0].s3.bucket.name,
        srcKey = event.Records[0].s3.object.key,
        dstBucket = srcBucket.replace("-original", ""),
        srcExtName = path.extname(srcKey),
        srcBaseName = path.basename(srcKey, srcExtName),
        shoutitWaterfall;

    // Sanity check: validate that source and destination are different buckets.
    if (srcBucket == dstBucket) {
        console.error("Destination bucket must not match source bucket.");
        return;
    }

    // Infer the image type.
    if (srcExtName == "") {
        console.error('unable to infer image type for key ' + srcKey);
        return;
    }
    if (srcExtName != ".jpg" && srcExtName != ".png") {
        console.log('skipping non-image ' + srcKey);
        return;
    }

    // Download the image from S3, transform, and upload to a different S3 bucket.
    shoutitWaterfall = [
        function download(next) {
            // Download the image from S3 into a buffer.
            s3.getObject(
                {
                    Bucket: srcBucket,
                    Key: srcKey
                },
                next
            );
        }

        // here we insert pair of (transform, upload) functions  using their generators
        // genTransform(srcExtName, MAX_WIDTH, MAX_HEIGHT),
        // genCompress(srcExtName),
        // genUpload(dstBucket, dstKey)
    ];

    Object.keys(VARIATIONS).forEach(function (key) {
        var variation = VARIATIONS[key],
            dstKey = srcBaseName + "_" + key + srcExtName;
        shoutitWaterfall.push(genTransform(srcExtName, variation[0], variation[1], variation[2]));
        shoutitWaterfall.push(genCompress(srcExtName));
        shoutitWaterfall.push(genUpload(dstBucket, dstKey));
    });

    async.waterfall(shoutitWaterfall,
        function (err) {
            if (err) {
                context.done('Unable to create thumbnails for ' + srcBucket + '/' + srcKey + ' due to an error: ' + err);
            } else {
                context.done(null, 'Successfully created thumbnails for ' + srcBucket + '/' + srcKey);
            }
        }
    );
};


function genTransform(extName, maxWidth, maxHeight, waterMark) {
    return function transform(response, next) {
        console.log('Transforming, maxWidth: ' + maxWidth + ' maxHeight: ' + maxHeight);
        gm(response.Body).size(function (err, size) {
            // Infer the scaling factor to avoid stretching the image unnaturally.
            var scalingFactor = Math.min(
                    maxWidth / size.width,
                    maxHeight / size.height
                ),
                width = scalingFactor * size.width,
                height = scalingFactor * size.height,
                posX = (width - 165) / 2,
                posY = (height - 44) / 2;

            // Transform the image buffer in memory.
            if (waterMark) {
                this.resize(width, height).draw(['image Over ' + posX + ',' + posY + ' 0,0 shoutitwm.png'])
                    .toBuffer(extName.slice(1), function (err, buffer) {
                        if (err) {
                            next(err);
                        } else {
                            next(null, buffer, response);
                        }
                    });
            } else {
                this.resize(width, height).toBuffer(extName.slice(1), function (err, buffer) {
                    if (err) {
                        next(err);
                    } else {
                        next(null, buffer, response);
                    }
                });
            }
        });
    };
}


function genCompress(extName) {
    return function compress(buffer, response, next) {
        console.log('Compressing, ext: ' + extName);
        var imagemin;
        if (extName == '.jpg') {
            imagemin = new Imagemin()
                .src(buffer)
                .use(Imagemin.jpegtran({progressive: true}));
        } else {
            imagemin = new Imagemin()
                .src(buffer)
                .use(Imagemin.optipng({optimizationLevel: 2}));
        }
        imagemin.run(function (err, files) {
            if (err) {
                next(err);
            } else {
                // files[0] => { contents: <Buffer 89 50 4e ...> }
                next(null, files[0].contents, response);
            }
        });
    };
}


function genUpload(dstBucket, dstKey) {
    return function upload(data, response, next) {
        // Stream the transformed image to a different S3 bucket.
        console.log('Uploading, dstBucket: ' + dstBucket + ' dstKey: ' + dstKey);
        s3.putObject(
            {
                Bucket: dstBucket,
                Key: dstKey,
                Body: data,
                ContentType: response.ContentType,
                CacheControl: 'max-age=31536000'
            },
            function (err) {
                if (err) {
                    next(err);
                } else {
                    next(null, response);
                }
            }
        );
    };
}


module.exports = {
    handler: handler,
    s3: s3,
    genTransform: genTransform,
    genCompress: genCompress,
    genUpload: genUpload
};
