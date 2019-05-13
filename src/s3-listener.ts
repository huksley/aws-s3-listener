import { apiResponse, findPayload, ext } from './util'
import { Context as LambdaContext, APIGatewayEvent, Callback as LambdaCallback } from 'aws-lambda'
import { logger } from './logger'
import { config } from './config'
import * as uuidV4 from 'uuid/v4'
import * as path from 'path'

import { StepFunctions } from 'aws-sdk'
const workflow = new StepFunctions({
  signatureVersion: 'v4',
  region: config.AWS_REGION,
})

/** Invoked on S3 event */
export const s3Handler = (
  event: APIGatewayEvent,
  context: LambdaContext,
  callback: LambdaCallback,
) => {
  logger.info(
    'event(' +
      typeof event +
      ') ' +
      JSON.stringify(event, null, 2) +
      ' context ' +
      JSON.stringify(context, null, 2),
  )

  const payload = findPayload(event)
  logger.info(`Using payload`, payload)

  try {
    logger.info('Got event', payload)
    const s3Event = payload as AWSLambda.S3Event
    if (s3Event.Records) {
      s3Event.Records.forEach(s3Record => {
        const fileName = s3Record.s3.object.key
        if (fileName.endsWith('.json')) {
          logger.info('Skipping JSON file', s3Record)
        } else if (fileName.indexOf('-thumbnail') > 0) {
          logger.info('Skipping thumbnail file', s3Record)
        } else {
          const s3Url = 's3://' + s3Record.s3.bucket.name + '/' + fileName
          const name = path.basename(fileName, ext(fileName))
          const userId = name.substring(0, name.lastIndexOf('-'))
          logger.info(`Starting workflow for s3Url=${s3Url}, userId=${userId}`)
          return workflow
            .startExecution({
              stateMachineArn: config.WORKFLOW_ARN,
              name: uuidV4(),
              input: JSON.stringify({
                s3Url,
                userId,
              }),
            })
            .promise()
            .then(workflowStartResult => {
              logger.warn('Execution started', workflowStartResult)
              apiResponse(event, context, callback).success(workflowStartResult)
            })
            .catch(workflowStartError => {
              logger.warn('Failed to start workflow', workflowStartError)
              apiResponse(event, context, callback).failure(
                'Failed to start workflow: ' + workflowStartError.message,
              )
            })
        }
      })
    }
  } catch (err) {
    logger.warn('Failed to process s3 event', err)
    apiResponse(event, context, callback).failure('Failed to process s3 event: ' + err.message)
  }
}
