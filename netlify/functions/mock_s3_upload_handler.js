// netlify/functions/mock-s3-upload.js
exports.handler = async function(event, context) {
  try {
    // Log the incoming request (without the body to avoid console flooding)
    console.log("Mock S3 upload called:", {
      method: event.httpMethod,
      query: event.queryStringParameters,
      headers: event.headers,
      bodySize: event.body ? (typeof event.body === 'string' ? event.body.length : 'binary data') : 0
    });

    // For OPTIONS requests (preflight), return appropriate CORS headers
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Length, x-requested-with',
          'Access-Control-Max-Age': '86400'
        }
      };
    }

    // Handle PUT requests
    if (event.httpMethod === 'PUT') {
      // Generate a fake ETag - using part number from query if available
      const partNo = event.queryStringParameters?.part || '0';
      const etag = `"mock-etag-part-${partNo}-${Date.now()}"`;

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Expose-Headers': 'ETag',
          'Content-Type': 'application/json',
          'ETag': etag
        },
        body: JSON.stringify({
          success: true,
          message: `Successfully "uploaded" part ${partNo}`,
          etag: etag
        })
      };
    }

    // Any other method is not allowed
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  } catch (error) {
    // Log any errors
    console.error("Error in mock S3 upload:", error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};