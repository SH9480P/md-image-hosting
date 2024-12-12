const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { fromSSO } = require('@aws-sdk/credential-providers')
const fs = require('node:fs/promises')
const path = require('path')

const getFileBlob = (filePath) => {
  return fs.readFile(filePath)
}

const getFileContentType = (filePath) => {
  const extName = path.extname(filePath)
  switch (extName) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.mp4':
      return 'video/mp4'
    default:
      throw new Error(`Unsupported file type (${extName})`)
  }
}

const getS3ObjectKeyName = (filePath, timestamp) => {
  const fileName = path.basename(filePath)
  const keyName = `${process.env.AWS_S3_DIRNAME}/${timestamp}-${fileName}`
  return keyName
}

const putS3Object = async (s3Client, keyName, blob, contentType) => {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: keyName,
    Body: blob,
    ContentType: contentType,
  })
  const response = await s3Client.send(command)
  console.log(response)
}

const createImageSyntax = (altText, imgURL, mouseoverText) => {
  return mouseoverText == null ? `![${altText}](${imgURL})` : `![${altText}](${imgURL} "${mouseoverText}")`
}

const getS3ObjectURL = (keyName) => `${process.env.AWS_CLOUDFRONT_DOMAIN}/${keyName}`
const getMarkdownImagePath = (mdPath, imgPathInMd) => path.join(path.dirname(mdPath), imgPathInMd)

const replaceMarkdown = async (s3Client, mdPath, mdBody, timestamp) => {
  const imgSyntaxRegex = /!\[(.*?)\]\((.*?)\s*(?:"(.*?)")?\)/g
  const imgSyntaxInfoList = [...mdBody.matchAll(imgSyntaxRegex)].map((result) => ({
    index: result.index,
    fullText: result[0],
    altText: result[1],
    imgPath: result[2],
    mouseoverText: result[3],
  }))
  for (const { index, fullText, altText, imgPath, mouseoverText } of imgSyntaxInfoList.toReversed()) {
    if (imgPath.startsWith('http')) continue
    const accessableImgPath = getMarkdownImagePath(mdPath, imgPath)
    const imgBlob = await getFileBlob(accessableImgPath)
    const keyName = getS3ObjectKeyName(accessableImgPath, timestamp)
    const contentType = getFileContentType(accessableImgPath)
    const imgURL = getS3ObjectURL(keyName)
    await putS3Object(s3Client, keyName, imgBlob, contentType)
    mdBody =
      mdBody.slice(0, index) + createImageSyntax(altText, imgURL, mouseoverText) + mdBody.slice(index + fullText.length)
    usedImageFiles.add(accessableImgPath)
  }
  return mdBody
}

const selectOnlyMarkdown = (argv) => argv.filter((arg) => arg.endsWith('.md'))

const usedImageFiles = new Set()

const main = async () => {
  const mdFiles = selectOnlyMarkdown(process.argv)
  if (mdFiles.length === 0) return

  const s3Client = new S3Client({
    credentials: fromSSO({
      profile: process.env.AWS_CLI_PROFILE,
    }),
    region: process.env.AWS_S3_BUCKET_REGION,
  })

  const timestamp = Date.now()

  for (const mdFile of mdFiles) {
    const mdBody = (await getFileBlob(mdFile)).toString()
    const replacedMdBody = await replaceMarkdown(s3Client, mdFile, mdBody, timestamp)
    await fs.writeFile(mdFile, replacedMdBody)
  }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
}).finally(() => {
    for (const imgPath of usedImageFiles) {
        fs.rm(imgPath)
    }
})
