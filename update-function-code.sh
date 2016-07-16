#!/bin/sh

OUT_FILE="out.zip"
rm -f bin/$OUT_FILE

cd src
echo "Creating archive to be uploaded..."
chmod -R 777 .
zip -rq ../bin/$OUT_FILE *
echo "$OUT_FILE created."

cd ..
aws lambda update-function-code \
--function-name CreateThumbnail2 \
--zip-file fileb://bin/$OUT_FILE
