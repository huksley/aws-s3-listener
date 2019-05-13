import { apiResponse, findPayload } from './util'
import { Context as LambdaContext, APIGatewayEvent, Callback as LambdaCallback } from 'aws-lambda'
import { logger } from './logger'
import { config } from './config'
import * as uuidV4 from 'uuid/v4'

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
    return workflow
      .startExecution({
        stateMachineArn: config.WORKFLOW_ARN,
        name: uuidV4(),
        input: JSON.stringify({
          some: 'event',
        }),
      })
      .promise()
      .then(r => {
        logger.warn('Execution started', r)
        apiResponse(event, context, callback).success(r)
      })
      .catch(err => {
        logger.warn('Failed to start workflow', err)
        apiResponse(event, context, callback).failure('Failed to start workflow: ' + err.message)
      })
  } catch (err) {
    logger.warn('Failed to process s3 event', err)
    apiResponse(event, context, callback).failure('Failed to process s3 event: ' + err.message)
  }
}
